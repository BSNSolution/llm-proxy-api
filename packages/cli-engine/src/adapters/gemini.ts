import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { estimateTokens } from '../usage.js';
import { composePrompt } from './shared.js';

/**
 * Adapter do Gemini CLI (Google).
 * Modo headless: `gemini --output-format stream-json -p "<prompt>"`.
 *
 * Formato documentado (eventos JSONL): init / message / tool_use / tool_result / result.
 * ⚠️ NÃO validado E2E nesta máquina: o free-tier foi descontinuado
 * (IneligibleTierError — Google migra p/ Antigravity). Ver AI/NOTES 17/07/2026.
 */
export class GeminiAdapter implements CliAdapter {
  readonly kind = 'gemini' as const;
  readonly supportsPersistentSession = false;

  buildArgs(turn: CliTurn): { command: string; args: string[] } {
    const args = ['--output-format', 'stream-json', '-p', composePrompt(turn)];
    if (turn.options.model) args.push('--model', turn.options.model);
    return { command: 'gemini', args };
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

    // erro de tier/auth vem como objeto de erro — traduz p/ mensagem clara
    if (type === 'error' || obj['error']) {
      const msg = String(
        (obj['error'] as { message?: string } | undefined)?.message ??
          obj['message'] ??
          'Erro no Gemini',
      );
      const friendly = msg.includes('Ineligible')
        ? 'Gemini free-tier descontinuado (migre para Antigravity).'
        : msg;
      return [
        { type: 'error', message: friendly },
        { type: 'done', finishReason: 'error' },
      ];
    }

    if (type === 'message') {
      const content = obj['content'] ?? obj['text'];
      if (typeof content === 'string') return [{ type: 'delta', text: content }];
      return [];
    }

    if (type === 'result') {
      const stats = obj['stats'] as { tokens?: { input?: number; output?: number } } | undefined;
      const events: StreamEvent[] = [];
      const response = obj['response'];
      if (typeof response === 'string') events.push({ type: 'delta', text: response });
      events.push({
        type: 'usage',
        inputTokens: stats?.tokens?.input ?? estimateTokens(String(response ?? '')),
        outputTokens: stats?.tokens?.output ?? 0,
        estimated: !stats?.tokens,
      });
      events.push({ type: 'done', finishReason: 'stop' });
      return events;
    }

    return [];
  }
}
