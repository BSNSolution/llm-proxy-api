// ExecutionSource — abstração acima do adapter. Uma "fonte" é de onde o turno
// será executado: `cli` (spawn da CLI local, usa a subscription) ou `http`
// (fala direto com o provider via API key, p/ container/VPS/CF ou fallback).
//
// runSource() é a interface única que o turn-runner consome, alternando entre o
// pool das CLIs e as fontes HTTP de forma transparente (mesmo AsyncGenerator).

import type { CliKind, CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import { getPool } from '../pool/index.js';
import { runHttpSource, type HttpProviderKind, type HttpSourceConfig } from './http-source.js';

export type SourceKind = 'cli' | 'http';

/** Referência a uma fonte concreta a executar. */
export type SourceRef =
  | { kind: 'cli'; cliKind: CliKind; model?: string }
  | { kind: 'http'; provider: HttpProviderKind; model: string };

export interface RunSourceOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** credenciais HTTP por provider (só usadas quando a fonte é http) */
  httpKeys?: Partial<Record<HttpProviderKind, { apiKey: string; baseUrl?: string }>>;
}

/** Executa um turno na fonte indicada, devolvendo o stream de eventos normalizados. */
export async function* runSource(
  ref: SourceRef,
  turn: CliTurn,
  opts: RunSourceOptions = {},
): AsyncGenerator<StreamEvent> {
  if (ref.kind === 'cli') {
    // Injeta o model no turn (o adapter lê turn.options.model).
    const t: CliTurn = ref.model ? { ...turn, options: { ...turn.options, model: ref.model } } : turn;
    yield* getPool().run(t, { signal: opts.signal, timeoutMs: opts.timeoutMs ?? turn.options.timeoutMs });
    return;
  }

  // http
  const cred = opts.httpKeys?.[ref.provider];
  if (!cred?.apiKey) {
    yield { type: 'error', message: `Fonte HTTP "${ref.provider}" sem API key configurada nesta instância.` };
    yield { type: 'done', finishReason: 'error' };
    return;
  }
  const cfg: HttpSourceConfig = { provider: ref.provider, apiKey: cred.apiKey, baseUrl: cred.baseUrl, model: ref.model };
  yield* runHttpSource(cfg, turn, { signal: opts.signal, timeoutMs: opts.timeoutMs ?? turn.options.timeoutMs });
}

/** Mapa CLI→provider HTTP equivalente (p/ o modo híbrido espelhar a mesma capacidade). */
export const CLI_TO_HTTP_PROVIDER: Partial<Record<CliKind, HttpProviderKind>> = {
  claude: 'anthropic',
  codex: 'openai',
  gemini: 'gemini',
};

export * from './http-source.js';
export * from './fallback.js';
