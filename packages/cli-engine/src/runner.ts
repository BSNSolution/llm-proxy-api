import { mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import { killTree, neutralWorkdir, resolveFirstBinary, spawnCli } from './platform/index.js';
import { CLI_REGISTRY } from './registry.js';
import type { CliAdapter } from './adapters/types.js';

export interface RunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Executa um turno em modo one-shot (spawn por request) e produz eventos
 * normalizados via async generator. Cross-platform: usa spawnCli (trata
 * .cmd/.bat/.ps1 no Windows) e killTree (mata a árvore no Windows).
 *
 * Lê o stdout linha a linha (readline) e delega o parse ao adapter.
 */
export async function* runTurn(
  adapter: CliAdapter,
  turn: CliTurn,
  opts: RunOptions = {},
): AsyncGenerator<StreamEvent> {
  const { command, args, env } = adapter.buildArgs(turn);
  const timeoutMs = opts.timeoutMs ?? turn.options.timeoutMs ?? 120_000;

  // Resolve o binário REAL do kind (nome primário + aliases do registry). Corrige
  // CLIs cujo binário instalado difere do nome no adapter (cursor: agent|cursor-agent;
  // antigravity: agy). Se nenhum alias resolver, mantém o command do adapter.
  const meta = CLI_REGISTRY[adapter.kind];
  const resolved = meta ? await resolveFirstBinary([meta.binary, ...(meta.binaryAliases ?? [])]) : null;
  const effectiveCommand = resolved?.name ?? command;

  // cwd neutro isola a CLI do projeto onde o servidor roda (sem CLAUDE.md/hooks herdados).
  const cwd = neutralWorkdir(adapter.kind);
  try {
    mkdirSync(cwd, { recursive: true });
  } catch {
    /* ignore */
  }

  const child = await spawnCli(effectiveCommand, args, { cwd, env, signal: opts.signal });

  const timer = setTimeout(() => killTree(child), timeoutMs);
  const rl = createInterface({ input: child.stdout as Readable, crlfDelay: Infinity });

  let stderrBuf = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString();
    if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192);
  });

  try {
    let sawDone = false;
    for await (const line of rl) {
      for (const ev of adapter.parseLine(line)) {
        if (ev.type === 'done') sawDone = true;
        yield ev;
      }
    }
    const exitCode: number = await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve(child.exitCode);
      child.on('close', (code) => resolve(code ?? 0));
    });

    if (!sawDone) {
      if (exitCode !== 0) {
        yield {
          type: 'error',
          message: `CLI '${adapter.kind}' saiu com código ${exitCode}${
            stderrBuf ? `: ${stderrBuf.trim().slice(-500)}` : ''
          }`,
        };
        yield { type: 'done', finishReason: 'error' };
      } else {
        yield { type: 'done', finishReason: 'stop' };
      }
    }
  } finally {
    clearTimeout(timer);
    rl.close();
    killTree(child);
  }
}
