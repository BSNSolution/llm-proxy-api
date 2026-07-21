import type { CliTurn, StreamEvent, TurnUsage } from '@llm-proxy/shared-types';
import {
  attachmentPromptSuffix,
  estimateTokens,
  getPool,
  materializeAttachments,
  transcribeAudio,
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
 * Executa um turno resolvendo o adapter certo e consumindo o stream de eventos.
 * Chama os callbacks conforme os eventos chegam (para streaming SSE) e ao final
 * devolve o texto agregado + usage (para modo non-stream).
 */
export async function executeTurn(
  turn: CliTurn,
  cb: TurnStreamCallbacks = {},
  signal?: AbortSignal,
): Promise<TurnResult> {
  let text = '';
  let usage: TurnUsage = { inputTokens: 0, outputTokens: 0, estimated: true };
  let gotRealUsage = false;
  let finishReason: TurnResult['finishReason'] = 'stop';

  // Materializa anexos (imagem/arquivo/áudio) em arquivos temp.
  // Imagem/arquivo → @path no prompt. Áudio → transcreve (Whisper) e injeta o texto.
  let cleanup: (() => void) | null = null;
  const attachments = turn.userMessage.attachments ?? [];
  if (attachments.length > 0) {
    const { files, cleanup: cln } = materializeAttachments(attachments);
    cleanup = cln;

    const nonAudio = files.filter((f) => f.kind !== 'audio');
    const audio = files.filter((f) => f.kind === 'audio');

    let extra = attachmentPromptSuffix(nonAudio);
    for (const a of audio) {
      const text = await transcribeAudio(a.path);
      if (text) {
        extra += `\n\n[Transcrição do áudio anexado]\n${text}`;
      } else {
        // sem whisper: passa o arquivo como @path (a CLI decide) + aviso
        extra += `\n\nÁudio anexado (transcrição indisponível nesta máquina): @${a.path}`;
      }
    }

    if (extra) {
      turn = {
        ...turn,
        userMessage: { ...turn.userMessage, content: turn.userMessage.content + extra },
      };
    }
  }

  try {
  // O pool decide: sessão persistente (Claude) ou one-shot (demais).
  for await (const ev of getPool().run(turn, { signal, timeoutMs: turn.options.timeoutMs })) {
    const e = ev as StreamEvent;
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
  }

  // Sem usage real (cursor/opencode/antigravity/gemini fallback): estima por chars/4.
  if (!gotRealUsage) {
    const inputText = [turn.systemPrompt ?? '', ...turn.history.map((m) => m.content), turn.userMessage.content].join(
      ' ',
    );
    usage = {
      inputTokens: estimateTokens(inputText),
      outputTokens: estimateTokens(text),
      estimated: true,
    };
  }

  // trimEnd remove o '\n' final espúrio dos adapters de texto puro (delta por linha).
  return { text: text.replace(/\n+$/, ''), usage, finishReason };
  } finally {
    cleanup?.();
  }
}
