import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

/**
 * Efeito colateral no import: carrega o `.env` ANTES de qualquer módulo que
 * chame loadConfig() no top-level (ex.: redis.ts). Deve ser o PRIMEIRO import do main.
 *
 * Procura o `.env` a partir do cwd e vai SUBINDO até a raiz do sistema. Isso faz
 * funcionar tanto `pnpm start` (cwd = raiz do repo) quanto `pnpm dev` via turbo
 * (cwd = apps/api), sem precisar duplicar o arquivo.
 *
 * Node 22+ tem process.loadEnvFile nativo (sem dependências).
 */
function findEnvFile(startDir: string): string | null {
  const root = parse(startDir).root;
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    if (dir === root) return null;
    dir = dirname(dir);
  }
}

try {
  const envPath = findEnvFile(process.cwd());
  if (envPath) process.loadEnvFile(envPath);
} catch {
  /* .env é opcional quando o ambiente já vem exportado (Docker, CI, systemd) */
}
