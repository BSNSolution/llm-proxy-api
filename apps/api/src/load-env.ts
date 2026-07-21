import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Efeito colateral no import: carrega o .env do cwd ANTES de qualquer módulo que
 * chame loadConfig() no top-level (ex.: redis.ts). Deve ser o PRIMEIRO import do main.
 * Node 22+ tem process.loadEnvFile nativo (sem dependências).
 */
try {
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
} catch {
  /* .env opcional quando o ambiente já está exportado (dev) */
}
