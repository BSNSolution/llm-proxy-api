import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { composePrompt } from './shared.js';

/**
 * Adapter do OpenCode.
 * OpenCode é server-first (`opencode serve`) e NÃO expõe OpenAI-compat nativo.
 * Para o modo one-shot usamos `opencode run` (execução não-interativa).
 *
 * ⚠️ Não validado E2E (CLI não instalada na máquina de dev). Formato provável:
 * saída em texto puro por linha (não JSONL garantido). Ver AI/RESEARCH.
 * Alternativa futura: integração via `opencode serve` (API própria).
 */
export class OpenCodeAdapter implements CliAdapter {
  readonly kind = 'opencode' as const;
  readonly supportsPersistentSession = false;

  buildArgs(turn: CliTurn): { command: string; args: string[] } {
    const args = ['run'];
    if (turn.options.model && !['auto', 'default', ''].includes(turn.options.model)) {
      args.push('--model', turn.options.model);
    }
    args.push(composePrompt(turn));
    return { command: 'opencode', args };
  }

  parseLine(line: string): StreamEvent[] {
    // Tenta JSONL; se não for JSON, trata a linha como texto puro (fallback).
    const trimmed = line.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof obj['text'] === 'string') return [{ type: 'delta', text: obj['text'] }];
        if (typeof obj['content'] === 'string') return [{ type: 'delta', text: obj['content'] }];
        return [];
      } catch {
        /* cai no texto puro */
      }
    }
    return [{ type: 'delta', text: line + '\n' }];
  }
}
