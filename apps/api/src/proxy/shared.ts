import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ProxyKey } from '@llm-proxy/db';
import type { AuthError } from '../services/proxy-auth.js';

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
