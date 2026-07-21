import type { ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createInterface, type Interface } from 'node:readline';
import type { Readable } from 'node:stream';
import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import { killTree, neutralWorkdir, spawnCli } from '../platform/index.js';

/**
 * Sessão persistente do Claude Code: mantém um processo vivo em modo
 * `--input-format stream-json --output-format stream-json`, enviando cada turno
 * como uma linha JSON no stdin e lendo os eventos do stdout. Evita o cold start
 * (~1-2s) de spawnar o processo a cada request.
 *
 * Implementação: um ÚNICO listener 'line' no readline empurra as linhas para o
 * turno ativo (não usamos vários `for await` sobre o mesmo readline — isso
 * competia pelo buffer e perdia turnos). Cada `send()` registra um consumidor
 * que recebe as linhas até ver o evento `result`.
 */
export class ClaudePersistentSession {
  private child: ChildProcess | null = null;
  private rl: Interface | null = null;
  private busy = false;
  lastUsedAt = Date.now();

  /** consumidor da linha atual (turno ativo) */
  private onLine: ((line: string) => void) | null = null;

  constructor(
    readonly id: string,
    private readonly model?: string,
    private readonly systemPrompt?: string,
  ) {}

  private async ensureStarted(): Promise<void> {
    if (this.child) return;
    const cwd = neutralWorkdir('claude');
    try {
      mkdirSync(cwd, { recursive: true });
    } catch {
      /* ignore */
    }
    const args = [
      '--print',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
    ];
    if (this.model && !['default', 'auto', ''].includes(this.model)) {
      args.push('--model', this.model);
    }
    if (this.systemPrompt) args.push('--system-prompt', this.systemPrompt);
    // stdin: 'pipe' — a sessão persistente envia turnos pelo stdin.
    this.child = await spawnCli('claude', args, { cwd, stdin: 'pipe' });
    this.rl = createInterface({ input: this.child.stdout as Readable, crlfDelay: Infinity });
    this.rl.on('line', (line) => this.onLine?.(line));
    this.child.on('exit', () => {
      this.child = null;
    });
  }

  /** Envia um turno e produz eventos normalizados até o `result`. */
  async *send(turn: CliTurn, parseLine: (line: string) => StreamEvent[]): AsyncGenerator<StreamEvent> {
    if (this.busy) throw new Error('Sessão ocupada com outro turno.');
    this.busy = true;
    this.lastUsedAt = Date.now();

    const queue: StreamEvent[] = [];
    let done = false;
    let resolveWait: (() => void) | null = null;
    const wake = (): void => {
      resolveWait?.();
      resolveWait = null;
    };

    this.onLine = (line: string) => {
      for (const ev of parseLine(line)) {
        if (ev.type === 'done') done = true;
        else queue.push(ev);
      }
      wake();
    };

    try {
      await this.ensureStarted();
      const child = this.child!;
      const payload = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: turn.userMessage.content },
      });
      child.stdin?.write(payload + '\n');

      while (true) {
        while (queue.length) yield queue.shift()!;
        if (done) {
          yield { type: 'done', finishReason: 'stop' };
          return;
        }
        if (!this.isAlive()) {
          yield { type: 'done', finishReason: 'stop' };
          return;
        }
        await new Promise<void>((res) => {
          resolveWait = res;
        });
      }
    } finally {
      this.onLine = null;
      this.busy = false;
      this.lastUsedAt = Date.now();
    }
  }

  isAlive(): boolean {
    return this.child !== null && this.child.exitCode === null && !this.child.killed;
  }

  isBusy(): boolean {
    return this.busy;
  }

  dispose(): void {
    this.onLine = null;
    this.rl?.close();
    this.rl = null;
    if (this.child) killTree(this.child);
    this.child = null;
  }
}
