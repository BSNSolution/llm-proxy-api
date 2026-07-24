import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from '@llm-proxy/crypto';
import { authenticateProxyKey } from '../services/proxy-auth.js';
import { executeTurn } from '../services/turn-runner.js';
import { openAiToTurn, type OpenAiMessage } from './map-turn.js';
import {
  applyEndpointCors,
  authorizeProxyRequest,
  extractBearer,
  recordUsage,
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
    const authz = await authorizeProxyRequest(req, reply, ChatBody, (b) =>
      JSON.stringify(b.messages).length,
    );
    if (!authz) return; // erro já enviado pelo helper
    const { key, body, model } = authz;
    const modelRes = { model };

    const turn = openAiToTurn(key.cliKind, body.messages as OpenAiMessage[], {
      model: modelRes.model,
      thinking: body.reasoning_effort ? body.reasoning_effort !== 'none' : undefined,
      timeoutMs: key.timeoutMs,
    });

    const id = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const startedAt = Date.now();

    if (body.stream) {
      reply.raw.writeHead(200, sseHeaders());
      const send = (obj: unknown): void => {
        if (!reply.raw.writableEnded) reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
      };
      // disconnect do cliente → aborta o turno (não deixa a CLI rodando à toa)
      const ac = new AbortController();
      req.raw.on('close', () => ac.abort());
      let finishReason = 'stop';
      try {
        const result = await executeTurn(
          turn,
          {
            onDelta: (text) =>
              send({
                id,
                object: 'chat.completion.chunk',
                created,
                model: modelRes.model,
                choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
              }),
            onError: (message) => send({ error: { message, code: 'cli_error' } }),
          },
          ac.signal,
        );
        finishReason = result.finishReason;
        await recordUsage(key.id, modelRes.model, result, startedAt);
      } catch (err) {
        // erro APÓS o 200 já enviado: não dá pra mudar status → emite erro no stream.
        finishReason = 'error';
        send({ error: { message: (err as Error).message ?? 'Erro ao gerar resposta.', code: 'cli_error' } });
      } finally {
        // SEMPRE finaliza no protocolo OpenAI (chunk final + [DONE]) para o client não travar.
        send({
          id,
          object: 'chat.completion.chunk',
          created,
          model: modelRes.model,
          choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
        });
        if (!reply.raw.writableEnded) {
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
        }
      }
      return;
    }

    // non-stream: agrega
    let result;
    try {
      result = await executeTurn(turn);
    } catch (err) {
      return reply
        .status(502)
        .send({ error: { message: (err as Error).message ?? 'Erro ao gerar resposta.', code: 'cli_error' } });
    }
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
