import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { composePrompt } from './shared.js';

/**
 * Adapter do Codex CLI (OpenAI).
 * Modo headless: `codex exec --json "<prompt>"`.
 *
 * Formato de eventos (validado na máquina, 17/07/2026 — ver AI/NOTES):
 *   {"type":"thread.started","thread_id":"…"}
 *   {"type":"turn.started"}
 *   {"type":"item.completed","item":{"type":"agent_message","text":"…"}}  ← resposta
 *   {"type":"turn.completed","usage":{"input_tokens":…,"output_tokens":…}}  ← tokens reais
 *
 * Gotcha: o prompt DEVE ir como argumento posicional; sem ele o codex fica lendo stdin.
 */
export class CodexAdapter implements CliAdapter {
  readonly kind = 'codex' as const;
  readonly supportsPersistentSession = false;

  buildArgs(turn: CliTurn): { command: string; args: string[] } {
    // --skip-git-repo-check: rodamos num cwd neutro (não-git) por isolamento;
    // sem essa flag o Codex recusa ("Not inside a trusted directory").
    const args = ['exec', '--json', '--skip-git-repo-check'];
    // Só passa --model quando NÃO for um alias default. Modelos específicos como
    // 'gpt-5-codex' não valem em conta ChatGPT; nesses casos deixamos a conta decidir.
    const model = turn.options.model;
    if (model && !['default', 'auto', 'gpt-5-codex', ''].includes(model)) {
      args.push('--model', model);
    }
    args.push(composePrompt(turn));
    return { command: 'codex', args };
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

    if (type === 'item.completed') {
      const item = obj['item'] as { type?: string; text?: string } | undefined;
      if (item?.type === 'agent_message' && typeof item.text === 'string') {
        return [{ type: 'delta', text: item.text }];
      }
      return [];
    }

    if (type === 'turn.completed') {
      const usage = obj['usage'] as
        | { input_tokens?: number; output_tokens?: number }
        | undefined;
      const events: StreamEvent[] = [];
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

    if (type === 'error' || type === 'turn.failed') {
      return [
        { type: 'error', message: String(obj['message'] ?? 'Erro no Codex') },
        { type: 'done', finishReason: 'error' },
      ];
    }

    return [];
  }
}
