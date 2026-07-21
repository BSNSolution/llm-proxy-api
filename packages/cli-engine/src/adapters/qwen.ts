import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { composePrompt, extractText, isGenericModel } from './shared.js';

/**
 * Adapter do Qwen Code (`qwen`, @qwen-code/qwen-code).
 * Headless: `qwen -p "<prompt>" --output-format stream-json --yolo [--model X]`.
 * NDJSON: {type: system|assistant|result, message:{content, role, usage:{input_tokens,output_tokens}}}.
 * `--yolo` auto-aprova. Tokens reais no `usage`.
 * Fonte: AI/NOTES/20_07_2026-modo_headless_7_clis_mercado.md
 *
 * ⚠️ Não validado E2E.
 */
export class QwenAdapter implements CliAdapter {
  readonly kind = 'qwen' as const;
  readonly supportsPersistentSession = false;

  buildArgs(turn: CliTurn): { command: string; args: string[]; env?: Record<string, string> } {
    const args = ['-p', composePrompt(turn), '--output-format', 'stream-json', '--yolo'];
    if (!isGenericModel(turn.options.model)) args.push('--model', turn.options.model!);
    return {
      command: 'qwen',
      args,
      env: { QWEN_CODE_SUPPRESS_YOLO_WARNING: '1' },
    };
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
    const message = obj['message'] as
      | { content?: unknown; usage?: { input_tokens?: number; output_tokens?: number } }
      | undefined;

    if (type === 'assistant' && message) {
      const text = extractText(message.content);
      return text ? [{ type: 'delta', text }] : [];
    }

    if (type === 'result') {
      const events: StreamEvent[] = [];
      const usage = message?.usage;
      if (usage) {
        events.push({
          type: 'usage',
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          estimated: false,
        });
      }
      events.push({ type: 'done', finishReason: 'stop' });
      return events;
    }

    return [];
  }
}
