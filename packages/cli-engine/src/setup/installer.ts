import type { CliKind } from '@llm-proxy/shared-types';
import { detectByKind } from '../detect.js';
import { killTree, resolveBinary, spawnCli } from '../platform/index.js';
import { getInstallSteps } from './plan.js';
import type { InstallEvent, InstallStep } from './types.js';
import { ALLOWED_MANAGERS } from './recipes.js';

const INSTALL_TIMEOUT_MS = 5 * 60_000; // 5 min por step

/** Erro se o step usar um gerenciador fora da allowlist (defesa em profundidade). */
function assertAllowed(step: InstallStep): void {
  if (!ALLOWED_MANAGERS.has(step.manager) || !ALLOWED_MANAGERS.has(step.command)) {
    throw new Error(`Gerenciador não permitido: ${step.manager}/${step.command}`);
  }
}

/** Quebra um buffer em linhas completas, retornando [linhas, resto]. */
function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? '';
  return { lines: parts, rest };
}

/**
 * Roda UM step de instalação, emitindo cada linha de stdout/stderr como progress.
 * Resolve com true se o processo saiu com código 0.
 */
async function runStep(step: InstallStep, emit: (e: InstallEvent) => void, signal?: AbortSignal): Promise<boolean> {
  assertAllowed(step);
  // Se o comando base não existe no PATH, pula este step (deixa cair p/ fallback).
  const resolved = await resolveBinary(step.command);
  if (!resolved) {
    emit({ type: 'progress', line: `» ${step.command} não encontrado — tentando alternativa...` });
    return false;
  }

  emit({ type: 'progress', line: `$ ${step.command} ${step.args.join(' ')}` });

  const child = await spawnCli(step.command, step.args, { signal });
  let buf = '';
  const onData = (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    const { lines, rest } = splitLines(buf);
    buf = rest;
    for (const line of lines) if (line.trim()) emit({ type: 'progress', line });
  };
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);

  const timer = setTimeout(() => killTree(child), INSTALL_TIMEOUT_MS);
  try {
    const code: number = await new Promise((resolve) => {
      child.on('close', (c) => resolve(c ?? 1));
      child.on('error', (err) => {
        emit({ type: 'progress', line: `erro: ${err.message}` });
        resolve(1);
      });
    });
    if (buf.trim()) emit({ type: 'progress', line: buf.trim() });
    return code === 0;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Instala uma CLI: tenta os steps do SO atual em ordem (fallback) até um sair 0.
 * Ao final, re-detecta a CLI para confirmar presença/versão.
 * `emit` recebe eventos de progresso ao vivo (o backend transforma em SSE).
 */
export async function installCli(
  kind: CliKind,
  emit: (e: InstallEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const steps = getInstallSteps(kind);
  if (steps.length === 0) {
    emit({ type: 'error', message: 'Sem receita de instalação para este SO.' });
    return;
  }

  let ok = false;
  for (const step of steps) {
    if (signal?.aborted) {
      emit({ type: 'error', message: 'Instalação cancelada.' });
      return;
    }
    emit({ type: 'progress', line: `→ ${step.label}` });
    try {
      ok = await runStep(step, emit, signal);
    } catch (err) {
      emit({ type: 'progress', line: `falhou: ${(err as Error).message}` });
      ok = false;
    }
    if (ok) break;
  }

  // Confirma via detecção real (o binário pode ter caído num PATH que exige rehash).
  const detected = await detectByKind(kind);
  if (detected.present) {
    emit({ type: 'done', installed: true, version: detected.version });
  } else if (ok) {
    // Instalou mas não resolveu no PATH desta sessão (ex.: ~/.local/bin não no PATH).
    emit({
      type: 'progress',
      line: 'Instalado, mas o binário não está no PATH desta sessão. Pode ser preciso reabrir o terminal/servidor.',
    });
    emit({ type: 'done', installed: true });
  } else {
    emit({ type: 'error', message: 'Não foi possível instalar automaticamente. Veja o log acima.' });
  }
}
