import { prisma } from '@llm-proxy/db';
import { decryptSecret } from '@llm-proxy/crypto';
import { loadConfig } from '@llm-proxy/config';
import type { HttpProviderKind } from '@llm-proxy/cli-engine';

/**
 * Lê as credenciais HTTP configuradas (decifradas) no formato que o runSource/
 * runWithFallback espera: { anthropic: {apiKey, baseUrl}, ... }. Só providers
 * habilitados. Cache curto para não decifrar a cada request.
 */
let cache: { at: number; keys: Partial<Record<HttpProviderKind, { apiKey: string; baseUrl?: string }>> } | null = null;
const TTL_MS = 15_000;

export async function getHttpKeys(): Promise<Partial<Record<HttpProviderKind, { apiKey: string; baseUrl?: string }>>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.keys;
  const master = loadConfig().sessionSecret;
  const rows = await prisma.httpProviderConfig.findMany({ where: { enabled: true } });
  const keys: Partial<Record<HttpProviderKind, { apiKey: string; baseUrl?: string }>> = {};
  for (const r of rows) {
    try {
      keys[r.provider as HttpProviderKind] = {
        apiKey: decryptSecret(r.apiKeyCipher, master),
        ...(r.baseUrl ? { baseUrl: r.baseUrl } : {}),
      };
    } catch {
      /* chave corrompida/secret mudou — ignora esse provider */
    }
  }
  cache = { at: Date.now(), keys };
  return keys;
}

export function invalidateHttpKeysCache(): void {
  cache = null;
}
