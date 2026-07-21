import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { composePrompt, extractText } from './shared.js';

/**
 * Adapter do Amp (Sourcegraph, `amp`, @sourcegraph/amp).
 * Headless: `amp -x "<prompt>" --stream-json` → NDJSON (schema Claude Code):
 *   system(init) / user / assistant{content:[blocos], usage} / result{usage}.
 * NÃO tem seleção de modelo (auto por "mode"). Roda tools sem aprovação (default).
 * Exige AMP_API_KEY no ambiente. Tokens reais no `usage`.
 * Fonte: AI/NOTES/20_07_2026-modo_headless_7_clis_mercado.md
 *
 * ⚠️ Não validado E2E.
 */
export class AmpAdapter implements CliAdapter {
  readonly kind = 'amp' as const;
  readonly supportsPersistentSession = false;

  buildArgs(turn: CliTurn): { command: string; args: string[] } {
    // Prompt como argumento de -x; --stream-json só funciona com -x.
    return { command: 'amp', args: ['-x', composePrompt(turn), '--stream-json'] };
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

    if (type === 'assistant') {
      const message = obj['message'] as { content?: unknown } | undefined;
      const text = extractText(message?.content);
      return text ? [{ type: 'delta', text }] : [];
    }

    if (type === 'result') {
      const events: StreamEvent[] = [];
      const usage = (obj['usage'] ?? (obj['message'] as { usage?: unknown } | undefined)?.usage) as
        | { input_tokens?: number; output_tokens?: number }
        | undefined;
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
