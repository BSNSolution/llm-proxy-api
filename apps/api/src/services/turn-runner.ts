import type { CliTurn, StreamEvent, TurnUsage } from '@llm-proxy/shared-types';
import {
  attachmentPromptSuffix,
  estimateTokens,
  getPool,
  materializeAttachments,
  runWithFallback,
  transcribeAudio,
  type RunSourceOptions,
  type SourceRef,
} from '@llm-proxy/cli-engine';

export interface TurnStreamCallbacks {
  onDelta?: (text: string) => void | Promise<void>;
  onThinking?: (text: string) => void | Promise<void>;
  onUsage?: (usage: TurnUsage) => void | Promise<void>;
  onError?: (message: string) => void | Promise<void>;
}

export interface TurnResult {
  text: string;
  usage: TurnUsage;
  finishReason: 'stop' | 'length' | 'error' | 'timeout';
}

/**
 * Consome um stream de StreamEvent (do pool OU do fallback de fontes) agregando
 * texto+usage e disparando os callbacks. Núcleo compartilhado.
 */
async function consumeStream(
  events: AsyncGenerator<StreamEvent> | { run: (onEvent: (ev: StreamEvent) => void | Promise<void>) => Promise<void> },
  turn: CliTurn,
  cb: TurnStreamCallbacks,
): Promise<TurnResult> {
  let text = '';
  let usage: TurnUsage = { inputTokens: 0, outputTokens: 0, estimated: true };
  let gotRealUsage = false;
  let finishReason: TurnResult['finishReason'] = 'stop';

  const handle = async (e: StreamEvent): Promise<void> => {
    switch (e.type) {
      case 'delta':
        text += e.text;
        await cb.onDelta?.(e.text);
        break;
      case 'thinking':
        await cb.onThinking?.(e.text);
        break;
      case 'usage':
        usage = { inputTokens: e.inputTokens, outputTokens: e.outputTokens, estimated: e.estimated };
        if (!e.estimated) gotRealUsage = true;
        await cb.onUsage?.(usage);
        break;
      case 'error':
        await cb.onError?.(e.message);
        finishReason = 'error';
        break;
      case 'done':
        finishReason = e.finishReason;
        break;
      default:
        break;
    }
  };

  if ('run' in events) {
    await events.run(handle);
  } else {
    for await (const ev of events) await handle(ev);
  }

  if (!gotRealUsage) {
    const inputText = [turn.systemPrompt ?? '', ...turn.history.map((m) => m.content), turn.userMessage.content].join(' ');
    usage = { inputTokens: estimateTokens(inputText), outputTokens: estimateTokens(text), estimated: true };
  }
  return { text: text.replace(/\n+$/, ''), usage, finishReason };
}

/**
 * Executa um turno numa lista ordenada de fontes com FALLBACK (combo/router) ou
 * numa única fonte. Materializa anexos, consome o stream e devolve texto+usage.
 * Se `refs` vazio, erro amigável (nenhuma fonte disponível).
 */
export async function executeTurnWithSources(
  refs: SourceRef[],
  turn: CliTurn,
  cb: TurnStreamCallbacks = {},
  opts: RunSourceOptions = {},
): Promise<TurnResult> {
  const { turn: prepared, cleanup } = await prepareAttachments(turn);
  try {
    if (refs.length === 0) {
      await cb.onError?.('Nenhuma fonte disponível para este destino (instale/habilite a CLI ou configure a API key HTTP).');
      return { text: '', usage: { inputTokens: 0, outputTokens: 0, estimated: true }, finishReason: 'error' };
    }
    return await consumeStream(
      { run: (onEvent) => runWithFallback(refs, prepared, onEvent, opts).then(() => undefined) },
      prepared,
      cb,
    );
  } finally {
    cleanup?.();
  }
}

/** Materializa anexos (imagem/arquivo/áudio) do turno; devolve turn ajustado + cleanup. */
async function prepareAttachments(turn: CliTurn): Promise<{ turn: CliTurn; cleanup: (() => void) | null }> {
  const attachments = turn.userMessage.attachments ?? [];
  if (attachments.length === 0) return { turn, cleanup: null };
  const { files, cleanup } = materializeAttachments(attachments);
  const nonAudio = files.filter((f) => f.kind !== 'audio');
  const audio = files.filter((f) => f.kind === 'audio');
  let extra = attachmentPromptSuffix(nonAudio);
  for (const a of audio) {
    const t = await transcribeAudio(a.path);
    extra += t
      ? `\n\n[Transcrição do áudio anexado]\n${t}`
      : `\n\nÁudio anexado (transcrição indisponível nesta máquina): @${a.path}`;
  }
  const next = extra
    ? { ...turn, userMessage: { ...turn.userMessage, content: turn.userMessage.content + extra } }
    : turn;
  return { turn: next, cleanup };
}

/**
 * Executa um turno resolvendo o adapter certo e consumindo o stream de eventos.
 * Chama os callbacks conforme os eventos chegam (para streaming SSE) e ao final
 * devolve o texto agregado + usage (para modo non-stream).
 *
 * @deprecated use executeTurnWithSources (suporta fallback). Mantido para a rota
 * de Chat interativo que ainda executa 1 CLI direto.
 */
export async function executeTurn(
  turn: CliTurn,
  cb: TurnStreamCallbacks = {},
  signal?: AbortSignal,
): Promise<TurnResult> {
  const { turn: prepared, cleanup } = await prepareAttachments(turn);
  try {
    // O pool decide: sessão persistente (Claude) ou one-shot (demais).
    return await consumeStream(getPool().run(prepared, { signal, timeoutMs: prepared.options.timeoutMs }), prepared, cb);
  } finally {
    cleanup?.();
  }
}
