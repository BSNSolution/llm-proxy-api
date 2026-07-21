import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { composePrompt, isGenericModel } from './shared.js';

/**
 * Adapter do Aider (`aider`, pip aider-chat).
 * Headless: `aider -m "<prompt>" --yes-always --no-auto-commits --no-git --no-pretty --no-stream [--model X]`.
 * Saída texto puro. `--no-git` porque rodamos em cwd neutro (não-repo); `--yes-always`
 * evita travar em confirmações; `--no-pretty` remove ANSI. Sem tokens reais (estima).
 * Fonte: AI/NOTES/20_07_2026-modo_headless_7_clis_mercado.md
 *
 * ⚠️ Não validado E2E.
 */
export class AiderAdapter implements CliAdapter {
  readonly kind = 'aider' as const;
  readonly supportsPersistentSession = false;

  buildArgs(turn: CliTurn): { command: string; args: string[] } {
    const args = [
      '-m',
      composePrompt(turn),
      '--yes-always',
      '--no-auto-commits',
      '--no-git',
      '--no-pretty',
      '--no-stream',
    ];
    if (!isGenericModel(turn.options.model)) args.push('--model', turn.options.model!);
    return { command: 'aider', args };
  }

  parseLine(line: string): StreamEvent[] {
    if (!line) return [];
    return [{ type: 'delta', text: `${line}\n` }];
  }
}
