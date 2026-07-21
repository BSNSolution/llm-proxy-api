import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/** Token aleatório url-safe (base64url) com `bytes` de entropia. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export { randomUUID };

/**
 * Gera uma API key de proxy no formato `sk-llmp-<token>`.
 * Retorna a key crua (mostrada uma única vez) e o prefixo p/ narrow no lookup.
 */
export function generateProxyKey(): { raw: string; prefix: string } {
  const raw = `sk-llmp-${randomToken(32)}`;
  return { raw, prefix: raw.slice(0, 14) };
}

/** Extrai o prefixo de uma key crua, para busca indexada antes do verify argon2. */
export function keyPrefix(raw: string): string {
  return raw.slice(0, 14);
}

const ARGON_OPTS = {
  // parâmetros equilibrados p/ uso interativo em single-machine
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hash argon2id de um segredo (key ou senha). */
export function hashSecret(secret: string): Promise<string> {
  return argonHash(secret, ARGON_OPTS);
}

/** Verifica um segredo contra um hash argon2id. */
export function verifySecret(hash: string, secret: string): Promise<boolean> {
  return argonVerify(hash, secret).catch(() => false);
}

/**
 * Hash rápido (SHA-256 hex) para tokens de ALTA entropia (sessão, 256 bits).
 * Não é para senhas — argon2 é para baixa entropia. Aqui o objetivo é lookup
 * indexado O(1) por tokenHash, sem varrer + argon2 em todas as sessões.
 */
export function fastHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
