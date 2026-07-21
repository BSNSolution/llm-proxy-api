import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import { getAdapter } from '../adapters/index.js';
import { runTurn, type RunOptions } from '../runner.js';
import { ClaudePersistentSession } from './persistent-session.js';

/**
 * Pool de execução de turnos.
 *
 * - CLIs com sessão persistente (Claude): reutiliza um processo vivo por
 *   (model, systemPrompt), com idle timeout. Evita cold start.
 * - Demais CLIs: cai no runner one-shot (spawn por request).
 *
 * O pool é single-machine e in-process (não distribuído).
 */
export interface PoolOptions {
  /** ms de inatividade antes de encerrar uma sessão persistente */
  idleTimeoutMs?: number;
  /** máximo de sessões persistentes simultâneas */
  maxSessions?: number;
}

export class CliPool {
  private sessions = new Map<string, ClaudePersistentSession>();
  private reaper: ReturnType<typeof setInterval> | null = null;
  private readonly idleTimeoutMs: number;
  private readonly maxSessions: number;

  constructor(opts: PoolOptions = {}) {
    this.idleTimeoutMs = opts.idleTimeoutMs ?? 5 * 60_000;
    this.maxSessions = opts.maxSessions ?? 4;
    this.startReaper();
  }

  private sessionKey(turn: CliTurn): string {
    return `${turn.kind}:${turn.options.model ?? 'default'}:${turn.systemPrompt ?? ''}`;
  }

  /** Executa um turno, usando sessão persistente quando aplicável. */
  async *run(turn: CliTurn, opts: RunOptions = {}): AsyncGenerator<StreamEvent> {
    const adapter = getAdapter(turn.kind);

    // Sessão persistente só p/ Claude por ora (único com o protocolo bidirecional validado).
    if (turn.kind === 'claude' && adapter.supportsPersistentSession) {
      const key = this.sessionKey(turn);
      let session = this.sessions.get(key);
      if (session && (!session.isAlive() || session.isBusy())) {
        // se morreu ou está ocupada, não reutiliza: cria efêmera (fallback one-shot)
        if (!session.isAlive()) {
          session.dispose();
          this.sessions.delete(key);
          session = undefined;
        }
      }
      if (!session && this.sessions.size < this.maxSessions) {
        session = new ClaudePersistentSession(key, turn.options.model, turn.systemPrompt);
        this.sessions.set(key, session);
      }
      if (session && !session.isBusy()) {
        yield* session.send(turn, (line) => adapter.parseLine(line));
        return;
      }
      // fallback: pool cheio ou sessão ocupada → one-shot
    }

    yield* runTurn(adapter, turn, opts);
  }

  private startReaper(): void {
    this.reaper = setInterval(() => {
      const now = Date.now();
      for (const [key, s] of this.sessions) {
        if (!s.isBusy() && now - s.lastUsedAt > this.idleTimeoutMs) {
          s.dispose();
          this.sessions.delete(key);
        }
      }
    }, 60_000);
    // não segura o process vivo por causa do timer
    this.reaper.unref?.();
  }

  /** Encerra todas as sessões e o reaper. */
  shutdown(): void {
    if (this.reaper) clearInterval(this.reaper);
    for (const s of this.sessions.values()) s.dispose();
    this.sessions.clear();
  }

  stats(): { sessions: number; keys: string[] } {
    return { sessions: this.sessions.size, keys: [...this.sessions.keys()] };
  }
}

/** Pool singleton para o processo. */
let poolSingleton: CliPool | null = null;
export function getPool(): CliPool {
  if (!poolSingleton) poolSingleton = new CliPool();
  return poolSingleton;
}

export { ClaudePersistentSession };
