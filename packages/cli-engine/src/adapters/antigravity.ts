import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { composePrompt } from './shared.js';

/**
 * Adapter do Antigravity CLI (Google).
 * Modo headless conforme docs do produto (agent-first, terminal). O formato exato
 * de output ainda precisa de spike com a CLI instalada.
 *
 * ⚠️ Não validado E2E (CLI não instalada). O CLIProxyAPI já suporta Antigravity
 * como provider — usar como referência de formato numa fase futura. Ver AI/RESEARCH.
 */
export class AntigravityAdapter implements CliAdapter {
  readonly kind = 'antigravity' as const;
  readonly supportsPersistentSession = false;

  buildArgs(turn: CliTurn): { command: string; args: string[] } {
    // Args provisórios: prompt não-interativo. Ajustar após spike.
    const args = ['-p', composePrompt(turn)];
    if (turn.options.model && !['auto', 'default', ''].includes(turn.options.model)) {
      args.push('--model', turn.options.model);
    }
    // binário real é `agy` (o runner resolve via registry, mas mantemos correto aqui)
    return { command: 'agy', args };
  }

  parseLine(line: string): StreamEvent[] {
    const trimmed = line.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof obj['text'] === 'string') return [{ type: 'delta', text: obj['text'] }];
        if (typeof obj['content'] === 'string') return [{ type: 'delta', text: obj['content'] }];
        if (obj['type'] === 'error') {
          return [
            { type: 'error', message: String(obj['message'] ?? 'Erro no Antigravity') },
            { type: 'done', finishReason: 'error' },
          ];
        }
        return [];
      } catch {
        /* texto puro */
      }
    }
    return [{ type: 'delta', text: line + '\n' }];
  }
}
