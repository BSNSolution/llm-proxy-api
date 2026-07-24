import { redis } from '../redis.js';

/**
 * Rate-limit simples por IP para endpoints de autenticação (login/setup),
 * mitiga brute-force. Janela deslizante por minuto via Redis INCR+EXPIRE.
 *
 * Fail-OPEN: se o Redis estiver indisponível, NÃO bloqueia o login (não derruba
 * o acesso do dono por causa de infra) — apenas não limita nesse intervalo.
 */
export async function authRateLimit(
  scope: string,
  ip: string,
  max: number,
  windowSec = 60,
): Promise<{ ok: boolean; retryAfter: number }> {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const key = `authrl:${scope}:${ip}:${bucket}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec + 1);
    if (count > max) return { ok: false, retryAfter: windowSec };
    return { ok: true, retryAfter: 0 };
  } catch {
    return { ok: true, retryAfter: 0 }; // fail-open
  }
}
