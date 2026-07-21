import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { composePrompt, isGenericModel } from './shared.js';

/**
 * Adapter do Continue CLI (`cn`, @continuedev/cli).
 * Headless: `cn -p "<prompt>" --auto --silent [--model X]` → resposta no stdout.
 * `--auto` evita travar pedindo aprovação; `--silent` remove tags de thinking.
 * O `--format json` existe mas o shape NÃO é documentado (AI/NOTES) → tratamos a
 * saída como texto (mais robusto); refinar ao inspecionar o JSON real. Estima tokens.
 *
 * ⚠️ Não validado E2E.
 */
export class ContinueAdapter implements CliAdapter {
  readonly kind = 'continue' as const;
  readonly supportsPersistentSession = false;

  buildArgs(turn: CliTurn): { command: string; args: string[] } {
    const args = ['-p', composePrompt(turn), '--auto', '--silent'];
    if (!isGenericModel(turn.options.model)) args.push('--model', turn.options.model!);
    return { command: 'cn', args };
  }

  parseLine(line: string): StreamEvent[] {
    if (!line) return [];
    return [{ type: 'delta', text: `${line}\n` }];
  }
}
