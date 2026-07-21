import Redis from 'ioredis';
import { loadConfig } from '@llm-proxy/config';

const { redisUrl } = loadConfig();

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 2,
  lazyConnect: false,
});

/** Chave Redis do contador de rate-limit por minuto de uma proxy key. */
export function rateLimitKey(proxyKeyId: string, minuteEpoch: number): string {
  return `rl:llm:${proxyKeyId}:${minuteEpoch}`;
}

/** Chave Redis da quota diária de tokens de uma proxy key (YYYY-MM-DD). */
export function quotaKey(proxyKeyId: string, day: string): string {
  return `quota:llm:${proxyKeyId}:${day}`;
}
