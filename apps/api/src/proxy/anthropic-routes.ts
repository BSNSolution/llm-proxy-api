import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from '@llm-proxy/crypto';
import { authenticateProxyKey } from '../services/proxy-auth.js';
import { executeTurnWithSources } from '../services/turn-runner.js';
import { resolveTarget } from '../services/resolve-target.js';
import { resolveRouterTarget } from '../services/resolve-router.js';
import { getHttpKeys } from '../services/http-providers.js';
import { anthropicToTurn, type AnthropicMessage } from './map-turn.js';
import {
  applyEndpointCors,
  authorizeProxyRequest,
  extractBearer,
  recordUsage,
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
    const authz = await authorizeProxyRequest(
      req,
      reply,
      MessagesBody,
      (b) => JSON.stringify(b.messages).length + (b.system?.length ?? 0),
    );
    if (!authz) return; // erro já enviado pelo helper
    const { key, body, model } = authz;

    const routerTarget = await resolveRouterTarget(key, model, body);
    const target = routerTarget ?? (await resolveTarget(key, model));
    const modelRes = { model: target.label };
    const httpKeys = await getHttpKeys();

    const turn = anthropicToTurn(key.cliKind, body.system, body.messages as AnthropicMessage[], {
      model,
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
        const result = await executeTurnWithSources(
          target.refs,
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
          { signal: ac.signal, httpKeys, timeoutMs: key.timeoutMs },
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
      result = await executeTurnWithSources(target.refs, turn, {}, { httpKeys, timeoutMs: key.timeoutMs });
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
