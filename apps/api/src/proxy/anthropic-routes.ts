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
import { anthropicToTurn, type AnthropicMessage } from './map-turn.js';
import {
  applyEndpointCors,
  extractBearer,
  resolveModel,
  sendProxyError,
  sseHeaders,
} from './shared.js';

const MessagesBody = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.unknown() })).min(1),
  stream: z.boolean().optional(),
  thinking: z.unknown().optional(),
});

/**
 * Rota Anthropic /v1/messages (dialeto nativo do Claude).
 * SSE emite os eventos message_start / content_block_delta / message_delta / message_stop.
 */
export function registerAnthropicRoutes(app: FastifyInstance): void {
  app.options('/v1/messages', async (req, reply) => {
    const auth = await authenticateProxyKey(extractBearer(req));
    if (auth.ok) applyEndpointCors(req, reply, auth.key);
    return reply.status(204).send();
  });

  app.post('/v1/messages', async (req: FastifyRequest, reply: FastifyReply) => {
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

    const parsed = MessagesBody.safeParse(req.body);
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

    const turn = anthropicToTurn(key.cliKind, body.system, body.messages as AnthropicMessage[], {
      model: modelRes.model,
      thinking: body.thinking !== undefined,
      timeoutMs: key.timeoutMs,
    });

    const id = `msg_${randomUUID().replace(/-/g, '')}`;
    const startedAt = Date.now();

    if (body.stream) {
      reply.raw.writeHead(200, sseHeaders());
      const event = (type: string, data: unknown): void => {
        if (!reply.raw.writableEnded) reply.raw.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      event('message_start', {
        type: 'message_start',
        message: { id, type: 'message', role: 'assistant', model: modelRes.model, content: [] },
      });
      event('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      const ac = new AbortController();
      req.raw.on('close', () => ac.abort());
      let stopReason = 'end_turn';
      let outTokens = 0;
      try {
        const result = await executeTurn(
          turn,
          {
            onDelta: (text) =>
              event('content_block_delta', {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text },
              }),
            onError: (message) => event('error', { type: 'error', error: { type: 'cli_error', message } }),
          },
          ac.signal,
        );
        stopReason = result.finishReason === 'error' ? 'error' : 'end_turn';
        outTokens = result.usage.outputTokens;
        await recordUsage(key.id, modelRes.model, result, startedAt);
      } catch (err) {
        stopReason = 'error';
        event('error', {
          type: 'error',
          error: { type: 'cli_error', message: (err as Error).message ?? 'Erro ao gerar resposta.' },
        });
      } finally {
        // SEMPRE fecha o protocolo Anthropic para o client não travar.
        event('content_block_stop', { type: 'content_block_stop', index: 0 });
        event('message_delta', { type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: outTokens } });
        event('message_stop', { type: 'message_stop' });
        if (!reply.raw.writableEnded) reply.raw.end();
      }
      return;
    }

    let result;
    try {
      result = await executeTurn(turn);
    } catch (err) {
      return reply
        .status(502)
        .send({ type: 'error', error: { type: 'cli_error', message: (err as Error).message ?? 'Erro ao gerar resposta.' } });
    }
    await recordUsage(key.id, modelRes.model, result, startedAt);
    return reply.send({
      id,
      type: 'message',
      role: 'assistant',
      model: modelRes.model,
      content: [{ type: 'text', text: result.text }],
      stop_reason: result.finishReason === 'error' ? 'error' : 'end_turn',
      usage: {
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
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
