import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { estimateTokens } from '../usage.js';
import { composePrompt } from './shared.js';

/**
 * Adapter do Claude Code CLI.
 * Modo headless: `claude --print --output-format stream-json --verbose`.
 * O stdout é NDJSON: um evento JSON por linha. O evento `result` traz tokens reais.
 *
 * Formato: NDJSON com um evento por linha; o evento result traz tokens reais.
 */
export class ClaudeAdapter implements CliAdapter {
  readonly kind = 'claude' as const;
  readonly supportsPersistentSession = true;

  buildArgs(turn: CliTurn): { command: string; args: string[] } {
    const args = ['--print', '--output-format', 'stream-json', '--verbose'];
    const model = turn.options.model;
    if (model) args.push('--model', model);
    if (turn.systemPrompt) args.push('--system-prompt', turn.systemPrompt);
    // O prompt do usuário vai como último argumento posicional. O system já vai por
    // --system-prompt acima → includeSystem:false p/ não duplicar no texto.
    // Anexos (imagem/arquivo) já foram materializados e referenciados via @path no content.
    args.push(composePrompt(turn, { includeSystem: false }));
    return { command: 'claude', args };
  }

  parseLine(line: string): StreamEvent[] {
    const trimmed = line.trim();
    if (!trimmed) return [];
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return [];
    }
    const type = obj['type'];

    // Evento de mensagem do assistant: content[] com blocos text/thinking.
    if (type === 'assistant' && obj['message']) {
      const msg = obj['message'] as { content?: Array<Record<string, unknown>> };
      const events: StreamEvent[] = [];
      for (const block of msg.content ?? []) {
        if (block['type'] === 'text' && typeof block['text'] === 'string') {
          events.push({ type: 'delta', text: block['text'] });
        } else if (block['type'] === 'thinking' && typeof block['thinking'] === 'string') {
          events.push({ type: 'thinking', text: block['thinking'] });
        } else if (block['type'] === 'tool_use') {
          events.push({
            type: 'tool_use',
            name: String(block['name'] ?? 'unknown'),
            input: block['input'],
          });
        }
      }
      return events;
    }

    // Evento final: traz usage com tokens reais e encerra.
    if (type === 'result') {
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
      const isError = obj['subtype'] === 'error' || obj['is_error'] === true;
      events.push({ type: 'done', finishReason: isError ? 'error' : 'stop' });
      return events;
    }

    return [];
  }

  /** Fallback de usage caso o evento result não venha (estimativa). */
  estimateUsage(inputText: string, outputText: string): StreamEvent {
    return {
      type: 'usage',
      inputTokens: estimateTokens(inputText),
      outputTokens: estimateTokens(outputText),
      estimated: true,
    };
  }
}
