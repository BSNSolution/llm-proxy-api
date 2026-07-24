import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
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

// ── Cifra simétrica reversível (AES-256-GCM) ────────────────────────────────
// Para segredos que precisam ser LIDOS de volta (ex.: API keys HTTP de provider
// guardadas na config). NÃO usar para senhas/keys de proxy (essas são hash).
// A chave deriva do masterSecret (o sessionSecret da instância) via scrypt.

const ENC_PREFIX = 'enc:v1:';

function deriveKey(masterSecret: string): Buffer {
  // salt fixo por versão — o masterSecret já é o segredo forte da instância.
  return scryptSync(masterSecret, 'llmp-enc-v1', 32);
}

/**
 * Cifra um texto com AES-256-GCM. Formato: `enc:v1:<iv>:<tag>:<ciphertext>`
 * (tudo base64url). Retorna string opaca segura p/ guardar no banco.
 */
export function encryptSecret(plaintext: string, masterSecret: string): string {
  const key = deriveKey(masterSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ct.toString('base64url')}`;
}

/**
 * Decifra um valor produzido por encryptSecret. Lança se o valor foi adulterado
 * (GCM auth tag) ou a chave está errada. Se o valor não tem o prefixo, assume
 * texto puro legado e devolve como está (migração suave).
 */
export function decryptSecret(stored: string, masterSecret: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  const [, , ivB64, tagB64, ctB64] = stored.split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('valor cifrado malformado');
  const key = deriveKey(masterSecret);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
}

/** true se o valor está no formato cifrado (tem o prefixo). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}
