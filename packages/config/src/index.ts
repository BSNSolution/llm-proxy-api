import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const INSECURE_SECRETS = new Set(['', 'change-me-dev-only', 'change-me-in-prod', 'changeme']);

/** Diretório de dados persistente (secret, etc.). DATA_DIR (env) ou <cwd>/.data. */
function dataDir(): string {
  const dir = process.env.DATA_DIR?.trim() || join(process.cwd(), '.data');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Segredo de sessão: se o ambiente não fornecer um seguro, gera um forte e
 * PERSISTE em <DATA_DIR>/.session-secret (sobrevive a restart, não é previsível).
 * Isso permite distribuir o app sem o operador ter que definir SESSION_SECRET.
 */
function resolveSessionSecret(fromEnv?: string): string {
  if (fromEnv && !INSECURE_SECRETS.has(fromEnv) && fromEnv.length >= 16) return fromEnv;
  try {
    const file = join(dataDir(), '.session-secret');
    if (existsSync(file)) {
      const saved = readFileSync(file, 'utf8').trim();
      if (saved.length >= 16) return saved;
    }
    const generated = randomBytes(48).toString('base64url');
    writeFileSync(file, generated, { mode: 0o600 });
    return generated;
  } catch {
    // último recurso: segredo efêmero (desloga no restart, mas nunca previsível)
    return randomBytes(48).toString('base64url');
  }
}

/**
 * Configuração central da aplicação, validada a partir do ambiente.
 * Single-machine: por default o backend faz bind em loopback.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(8787),
  API_HOST: z.string().default('127.0.0.1'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:8787'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6380'),
  SESSION_SECRET: z.string().optional(),
  CLI_ENV_ALLOWLIST: z
    .string()
    .default('HOME,PATH,USER,USERPROFILE,APPDATA,LOCALAPPDATA,SHELL,LANG,TERM'),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  apiPort: number;
  apiHost: string;
  publicBaseUrl: string;
  databaseUrl: string;
  redisUrl: string;
  sessionSecret: string;
  /** env vars permitidas de repassar ao spawn das CLIs (hardening — não herdar process.env inteiro) */
  cliEnvAllowlist: string[];
};

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.parse(env);
  cached = {
    nodeEnv: parsed.NODE_ENV,
    apiPort: parsed.API_PORT,
    apiHost: parsed.API_HOST,
    publicBaseUrl: parsed.PUBLIC_BASE_URL,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    sessionSecret: resolveSessionSecret(parsed.SESSION_SECRET),
    cliEnvAllowlist: parsed.CLI_ENV_ALLOWLIST.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
  return cached;
}
