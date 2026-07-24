import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { prisma, type ProxyKey } from '@llm-proxy/db';
import {
  addQuotaUsage,
  authenticateProxyKey,
  checkDailyQuota,
  checkRateLimit,
  type AuthError,
} from '../services/proxy-auth.js';

/** Extrai o token do header Authorization (Bearer) ou x-api-key. */
export function extractBearer(req: FastifyRequest): string | undefined {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const xkey = req.headers['x-api-key'];
  if (typeof xkey === 'string') return xkey.trim();
  return undefined;
}

/**
 * Aplica CORS por-endpoint: se a key define corsOrigins e o request tem Origin,
 * valida contra a allowlist e seta os headers. `*` libera geral. Retorna true se
 * o Origin é permitido (ou não há restrição), false se deve ser bloqueado.
 */
export function applyEndpointCors(req: FastifyRequest, reply: FastifyReply, key: ProxyKey): boolean {
  const origin = req.headers['origin'];
  if (typeof origin !== 'string') return true; // não-browser: sem CORS
  const allow = key.corsOrigins;
  if (allow.length === 0) return true; // sem restrição configurada
  const ok = allow.includes('*') || allow.includes(origin);
  if (ok) {
    reply.header('Access-Control-Allow-Origin', allow.includes('*') ? '*' : origin);
    reply.header('Access-Control-Allow-Headers', 'authorization, x-api-key, content-type');
    reply.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    reply.header('Vary', 'Origin');
  }
  return ok;
}

/** Headers para resposta SSE (anti-buffer em proxies). */
export function sseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

/** Envia um erro no formato compatível com OpenAI/Anthropic. */
export function sendProxyError(reply: FastifyReply, err: AuthError): FastifyReply {
  return reply
    .status(err.status)
    .send({ error: { message: err.message, type: err.code, code: err.code } });
}

export type ModelResolution =
  | { ok: true; model: string }
  | { ok: false; error: AuthError };

/**
 * Resolve o modelo pedido contra a allowlist da key.
 * Aliases "default"/"auto"/""/nome-da-cli caem no defaultModel da key.
 */
export function resolveModel(key: ProxyKey, requested?: string): ModelResolution {
  const fallback = key.defaultModel ?? key.allowedModels[0];
  const isAlias =
    !requested || ['default', 'auto', '', key.cliKind, `${key.cliKind}-cli`].includes(requested);
  const model = isAlias ? fallback : requested;
  if (!model) {
    return {
      ok: false,
      error: { ok: false, status: 400, code: 'no_model', message: 'Nenhum modelo configurado para esta key.' },
    };
  }
  if (key.allowedModels.length && !key.allowedModels.includes(model)) {
    return {
      ok: false,
      error: {
        ok: false,
        status: 400,
        code: 'model_not_allowed',
        message: `Modelo '${model}' não permitido. Permitidos: ${key.allowedModels.join(', ')}.`,
      },
    };
  }
  return { ok: true, model };
}

/**
 * Pipeline comum de TODA request do proxy (OpenAI e Anthropic), evitando
 * divergência de gates entre os dois endpoints: autentica a key → aplica CORS
 * por-endpoint → rate-limit → quota diária → valida o body (Zod) → resolve o
 * modelo contra a allowlist → checa maxInputChars. Em qualquer falha, JÁ envia
 * o erro no formato do proxy e retorna null (o handler só faz `return`).
 */
export async function authorizeProxyRequest<S extends z.ZodTypeAny>(
  req: FastifyRequest,
  reply: FastifyReply,
  schema: S,
  getInputChars: (body: z.infer<S>) => number,
): Promise<{ key: ProxyKey; body: z.infer<S>; model: string } | null> {
  const auth = await authenticateProxyKey(extractBearer(req));
  if (!auth.ok) {
    sendProxyError(reply, auth);
    return null;
  }
  const key = auth.key;

  if (!applyEndpointCors(req, reply, key)) {
    sendProxyError(reply, {
      ok: false,
      status: 403,
      code: 'cors_origin_not_allowed',
      message: 'Origin não permitido para esta key.',
    });
    return null;
  }

  const rl = await checkRateLimit(key);
  if (rl) {
    sendProxyError(reply, rl);
    return null;
  }
  const q = await checkDailyQuota(key);
  if (q) {
    sendProxyError(reply, q);
    return null;
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    sendProxyError(reply, {
      ok: false,
      status: 400,
      code: 'invalid_request',
      message: parsed.error.message,
    });
    return null;
  }
  const body = parsed.data as z.infer<S>;

  const modelRes = resolveModel(key, (body as { model?: string }).model);
  if (!modelRes.ok) {
    sendProxyError(reply, modelRes.error);
    return null;
  }

  const inputChars = getInputChars(body);
  if (inputChars > key.maxInputChars) {
    sendProxyError(reply, {
      ok: false,
      status: 413,
      code: 'input_too_large',
      message: `Input excede maxInputChars (${key.maxInputChars}).`,
    });
    return null;
  }

  return { key, body, model: modelRes.model };
}

/** Registra o uso do turno (quota + UsageLog). Compartilhado pelos dois dialetos. */
export async function recordUsage(
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
