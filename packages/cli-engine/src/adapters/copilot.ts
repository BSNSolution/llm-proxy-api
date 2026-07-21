import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { composePrompt, isGenericModel } from './shared.js';

/**
 * Adapter do GitHub Copilot CLI (`copilot`, @github/copilot).
 * Headless: `copilot -p "<prompt>" --allow-all-tools [--model X]` → texto puro.
 * `--allow-all-tools` evita travar pedindo aprovação. Sem tokens reais (estima).
 * Fonte: AI/NOTES/20_07_2026-modo_headless_7_clis_mercado.md
 *
 * ⚠️ Não validado E2E (CLI não instalada na máquina de dev).
 */
export class CopilotAdapter implements CliAdapter {
  readonly kind = 'copilot' as const;
  readonly supportsPersistentSession = false;

  buildArgs(turn: CliTurn): { command: string; args: string[] } {
    const args = ['-p', composePrompt(turn), '--allow-all-tools'];
    if (!isGenericModel(turn.options.model)) args.push('--model', turn.options.model!);
    return { command: 'copilot', args };
  }

  // Saída é texto puro → cada linha é um delta; o runner fecha com 'done' no exit.
  parseLine(line: string): StreamEvent[] {
    if (!line) return [];
    return [{ type: 'delta', text: `${line}\n` }];
  }
}
