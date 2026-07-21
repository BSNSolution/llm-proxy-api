import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from '@llm-proxy/crypto';
import { prisma } from '@llm-proxy/db';
import {
  addQuotaUsage,
  authenticateProxyKey,
  checkDailyQuota,
  checkRateLimit,
} from '../services/proxy-auth.js';
import { executeTurn } from '../services/turn-runner.js';
import { openAiToTurn, type OpenAiMessage } from './map-turn.js';
import {
  applyEndpointCors,
  extractBearer,
  resolveModel,
  sendProxyError,
  sseHeaders,
} from './shared.js';

const ChatBody = z.object({
  model: z.string().optional(),
  messages: z.array(z.object({ role: z.string(), content: z.unknown() })).min(1),
  stream: z.boolean().optional(),
  reasoning_effort: z.string().optional(),
});

export function registerOpenAiRoutes(app: FastifyInstance): void {
  app.get('/v1/models', async (req, reply) => {
    const auth = await authenticateProxyKey(extractBearer(req));
    if (!auth.ok) return sendProxyError(reply, auth);
    const models = auth.key.allowedModels.length
      ? auth.key.allowedModels
      : auth.key.defaultModel
        ? [auth.key.defaultModel]
        : [];
    return reply.send({
      object: 'list',
      data: models.map((id) => ({ id, object: 'model', owned_by: auth.key.cliKind })),
    });
  });

  // Preflight CORS por-endpoint p/ clients browser.
  app.options('/v1/chat/completions', async (req, reply) => {
    const auth = await authenticateProxyKey(extractBearer(req));
    if (auth.ok) applyEndpointCors(req, reply, auth.key);
    return reply.status(204).send();
  });

  app.post('/v1/chat/completions', async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await authenticateProxyKey(extractBearer(req));
    if (!auth.ok) return sendProxyError(reply, auth);
    const key = auth.key;

    if (!applyEndpointCors(req, reply, key)) {
      return sendProxyError(reply, {
        ok: false,
        status: 403,
        code: 'cors_origin_not_allowed',
        message: 'Origin não permitido para esta key.',
      });
    }

    const rl = await checkRateLimit(key);
    if (rl) return sendProxyError(reply, rl);
    const q = await checkDailyQuota(key);
    if (q) return sendProxyError(reply, q);

    const parsed = ChatBody.safeParse(req.body);
    if (!parsed.success) {
      return sendProxyError(reply, {
        ok: false,
        status: 400,
        code: 'invalid_request',
        message: parsed.error.message,
      });
    }
    const body = parsed.data;

    const modelRes = resolveModel(key, body.model);
    if (!modelRes.ok) return sendProxyError(reply, modelRes.error);

    const turn = openAiToTurn(key.cliKind, body.messages as OpenAiMessage[], {
      model: modelRes.model,
      thinking: body.reasoning_effort ? body.reasoning_effort !== 'none' : undefined,
      timeoutMs: key.timeoutMs,
    });

    const inputChars = JSON.stringify(body.messages).length;
    if (inputChars > key.maxInputChars) {
      return sendProxyError(reply, {
        ok: false,
        status: 413,
        code: 'input_too_large',
        message: `Input excede maxInputChars (${key.maxInputChars}).`,
      });
    }

    const id = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const startedAt = Date.now();

    if (body.stream) {
      reply.raw.writeHead(200, sseHeaders());
      const send = (obj: unknown): void => {
        reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
      };
      const result = await executeTurn(turn, {
        onDelta: (text) =>
          send({
            id,
            object: 'chat.completion.chunk',
            created,
            model: modelRes.model,
            choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
          }),
        onError: (message) => send({ error: { message, code: 'cli_error' } }),
      });
      send({
        id,
        object: 'chat.completion.chunk',
        created,
        model: modelRes.model,
        choices: [{ index: 0, delta: {}, finish_reason: result.finishReason }],
      });
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
      await recordUsage(key.id, modelRes.model, result, startedAt);
      return;
    }

    // non-stream: agrega
    const result = await executeTurn(turn);
    await recordUsage(key.id, modelRes.model, result, startedAt);
    return reply.send({
      id,
      object: 'chat.completion',
      created,
      model: modelRes.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: result.text },
          finish_reason: result.finishReason,
        },
      ],
      usage: {
        prompt_tokens: result.usage.inputTokens,
        completion_tokens: result.usage.outputTokens,
        total_tokens: result.usage.inputTokens + result.usage.outputTokens,
      },
    });
  });
}

async function recordUsage(
  proxyKeyId: string,
  model: string,
  result: { usage: { inputTokens: number; outputTokens: number; estimated: boolean }; finishReason: string },
  startedAt: number,
): Promise<void> {
  const total = result.usage.inputTokens + result.usage.outputTokens;
  await addQuotaUsage(proxyKeyId, total);
  await prisma.usageLog
    .create({
      data: {
        proxyKeyId,
        model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        estimated: result.usage.estimated,
        latencyMs: Date.now() - startedAt,
        status: result.finishReason === 'error' ? 500 : 200,
      },
    })
    .catch(() => {});
}
