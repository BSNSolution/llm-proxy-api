import { prisma, type ProxyKey } from '@llm-proxy/db';
import { keyPrefix, verifySecret } from '@llm-proxy/crypto';
import { redis, rateLimitKey, quotaKey } from '../redis.js';

export interface AuthResult {
  ok: true;
  key: ProxyKey;
}
export interface AuthError {
  ok: false;
  status: number;
  code: string;
  message: string;
}

/**
 * Autentica uma proxy key `sk-llmp-…` vinda do header.
 * Estratégia: narrow por prefixo (indexado) → verifica argon2 → checa flags.
 */
export async function authenticateProxyKey(raw: string | undefined): Promise<AuthResult | AuthError> {
  if (!raw || !raw.startsWith('sk-llmp-')) {
    return { ok: false, status: 401, code: 'invalid_api_key', message: 'API key ausente ou inválida.' };
  }
  const prefix = keyPrefix(raw);
  const candidates = await prisma.proxyKey.findMany({ where: { prefix } });
  for (const cand of candidates) {
    if (await verifySecret(cand.keyHash, raw)) {
      if (!cand.enabled || cand.revokedAt) {
        return { ok: false, status: 403, code: 'key_revoked', message: 'API key revogada ou desabilitada.' };
      }
      if (cand.expiresAt && cand.expiresAt.getTime() < Date.now()) {
        return { ok: false, status: 403, code: 'key_expired', message: 'API key expirada.' };
      }
      // lastUsedAt fire-and-forget
      void prisma.proxyKey.update({ where: { id: cand.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      return { ok: true, key: cand };
    }
  }
  return { ok: false, status: 401, code: 'invalid_api_key', message: 'API key inválida.' };
}

/** Aplica rate-limit por minuto. Retorna null se ok, ou o erro. */
export async function checkRateLimit(key: ProxyKey): Promise<AuthError | null> {
  const minuteEpoch = Math.floor(Date.now() / 60_000);
  const rk = rateLimitKey(key.id, minuteEpoch);
  // INCR + EXPIRE atômicos num pipeline: garante o TTL mesmo se o processo cair
  // entre os dois (senão a chave poderia ficar sem expiração e travar a key).
  const [count] = (await redis.multi().incr(rk).expire(rk, 65).exec())?.map((r) => r?.[1]) ?? [];
  if (typeof count === 'number' && count > key.rateLimitPerMin) {
    return {
      ok: false,
      status: 429,
      code: 'rate_limit_exceeded',
      message: `Limite de ${key.rateLimitPerMin} req/min excedido.`,
    };
  }
  return null;
}

/**
 * Verifica se ainda há quota diária de tokens. Retorna null se ok.
 *
 * A leitura é atômica (Redis GET) e reflete tudo que já foi registrado por
 * addQuotaUsage (INCRBY atômico). Como os tokens de UM turno só são conhecidos
 * DEPOIS de executá-lo, a quota é um teto SUAVE: sob rajada concorrente pode
 * haver um pequeno overshoot (as requisições em voo ainda não somaram). Para o
 * uso self-hosted/pessoal isso é aceitável (limite de custo, não hard cap).
 */
export async function checkDailyQuota(key: ProxyKey): Promise<AuthError | null> {
  if (key.dailyTokenQuota == null) return null;
  const day = new Date().toISOString().slice(0, 10);
  const used = Number((await redis.get(quotaKey(key.id, day))) ?? 0);
  if (used >= key.dailyTokenQuota) {
    return {
      ok: false,
      status: 429,
      code: 'quota_exceeded',
      message: `Quota diária de ${key.dailyTokenQuota} tokens excedida.`,
    };
  }
  return null;
}

/** Incrementa a quota diária consumida (após o turno). */
export async function addQuotaUsage(keyId: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  const day = new Date().toISOString().slice(0, 10);
  const qk = quotaKey(keyId, day);
  const total = await redis.incrby(qk, tokens);
  if (total === tokens) await redis.expire(qk, 60 * 60 * 26); // ~26h
}

/** Lê a quota consumida hoje (para UI). */
export async function usedTokensToday(keyId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  return Number((await redis.get(quotaKey(keyId, day))) ?? 0);
}
