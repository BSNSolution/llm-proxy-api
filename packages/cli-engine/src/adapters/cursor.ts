import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { composePrompt } from './shared.js';

/**
 * Adapter do Cursor CLI (`cursor-agent`).
 * Modo headless: `cursor-agent -p --output-format stream-json "<prompt>"`.
 *
 * ⚠️ Não validado E2E (CLI não instalada na máquina de dev). Formato conforme
 * cursor.com/docs/cli/reference/output-format: JSONL com eventos de assistant/tool.
 */
export class CursorAdapter implements CliAdapter {
  readonly kind = 'cursor' as const;
  readonly supportsPersistentSession = false;

  buildArgs(turn: CliTurn): { command: string; args: string[] } {
    const args = ['-p', '--output-format', 'stream-json'];
    if (turn.options.model && !['auto', 'default', ''].includes(turn.options.model)) {
      args.push('--model', turn.options.model);
    }
    args.push(composePrompt(turn));
    return { command: 'cursor-agent', args };
  }

  parseLine(line: string): StreamEvent[] {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) return [];
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return [];
    }
    const type = obj['type'];

    // blocos de texto do assistant
    if (type === 'assistant' || type === 'message' || type === 'text') {
      const text =
        (typeof obj['text'] === 'string' && obj['text']) ||
        (typeof obj['content'] === 'string' && obj['content']) ||
        '';
      if (text) return [{ type: 'delta', text }];
      return [];
    }

    // fim do turno. Sem tokens reais; o consumidor (turn-runner) estima pelo texto.
    if (type === 'result' || type === 'done' || type === 'end') {
      return [{ type: 'done', finishReason: 'stop' }];
    }

    if (type === 'error') {
      return [
        { type: 'error', message: String(obj['message'] ?? 'Erro no Cursor') },
        { type: 'done', finishReason: 'error' },
      ];
    }

    return [];
  }
}
