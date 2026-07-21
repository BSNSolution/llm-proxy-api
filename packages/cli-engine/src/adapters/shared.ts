import type { CliTurn } from '@llm-proxy/shared-types';

/**
 * Compõe o prompt de um turno num único texto (sistema + histórico + msg atual).
 * Reusado pelos adapters cuja CLI recebe o prompt como um bloco de texto.
 *
 * `includeSystem` (default true): quando a CLI já passa o system por flag dedicada
 * (ex.: Claude `--system-prompt`), use false para não duplicar o system no texto.
 */
export function composePrompt(turn: CliTurn, opts: { includeSystem?: boolean } = {}): string {
  const includeSystem = opts.includeSystem ?? true;
  const parts: string[] = [];
  if (includeSystem && turn.systemPrompt) parts.push(`[Sistema]\n${turn.systemPrompt}`);
  for (const m of turn.history) {
    const who = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : m.role;
    parts.push(`${who}: ${m.content}`);
  }
  parts.push(turn.userMessage.content);
  return parts.join('\n\n');
}

/** True se o modelo é um alias genérico (não deve virar flag --model). */
export function isGenericModel(model?: string): boolean {
  return !model || ['auto', 'default', ''].includes(model);
}

/**
 * Extrai texto de um campo `content` que pode ser string OU array de blocos.
 * Cobre os formatos NDJSON de Qwen e Amp: blocos {text} e {type:'text', text}.
 */
export function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (!b || typeof b !== 'object' || !('text' in b)) return '';
        const block = b as { type?: unknown; text?: unknown };
        // se houver 'type', só considera blocos de texto; senão aceita qualquer {text}
        if (block.type !== undefined && block.type !== 'text') return '';
        return typeof block.text === 'string' ? block.text : '';
      })
      .join('');
  }
  return '';
}
