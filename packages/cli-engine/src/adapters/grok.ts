import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { composePrompt, isGenericModel } from './shared.js';

/**
 * Adapter do Grok CLI (xAI oficial, `grok`, via x.ai/cli).
 * Headless: `grok -p "<prompt>" --output-format streaming-json --always-approve
 *            --no-auto-update --no-alt-screen [-m X]`.
 * NDJSON estilo ACP/JSON-RPC: notif `session/update` c/ sessionUpdate:"agent_message_chunk"
 * e params.content.text (chunk); fim `session/prompt` com stopReason. Sem tokens (estima).
 * Fonte: AI/NOTES/20_07_2026-modo_headless_7_clis_mercado.md
 *
 * ⚠️ Não confundir com o superagent-ai/grok-cli de terceiros. Não validado E2E.
 */
export class GrokAdapter implements CliAdapter {
  readonly kind = 'grok' as const;
  readonly supportsPersistentSession = false;

  buildArgs(turn: CliTurn): { command: string; args: string[] } {
    const args = [
      '-p',
      composePrompt(turn),
      '--output-format',
      'streaming-json',
      '--always-approve',
      '--no-auto-update',
      '--no-alt-screen',
    ];
    if (!isGenericModel(turn.options.model)) args.push('-m', turn.options.model!);
    return { command: 'grok', args };
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

    const method = obj['method'];
    const params = obj['params'] as Record<string, unknown> | undefined;

    // Chunk de texto do agente.
    if (method === 'session/update' && params) {
      const update = params['sessionUpdate'] ?? params['update'];
      const content = params['content'] as { text?: unknown } | undefined;
      const text =
        (content && typeof content.text === 'string' && content.text) ||
        (typeof params['text'] === 'string' && (params['text'] as string)) ||
        '';
      if (
        text &&
        (update === undefined || update === 'agent_message_chunk' || String(update).includes('message'))
      ) {
        return [{ type: 'delta', text }];
      }
      return [];
    }

    // Fim do turno — stopReason pode vir no topo, em params ou em result.
    const result = obj['result'] as Record<string, unknown> | undefined;
    const hasStop =
      obj['stopReason'] !== undefined ||
      params?.['stopReason'] !== undefined ||
      result?.['stopReason'] !== undefined;
    if (method === 'session/prompt' || hasStop) {
      return [{ type: 'done', finishReason: 'stop' }];
    }

    return [];
  }
}
