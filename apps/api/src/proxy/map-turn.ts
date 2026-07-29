import type { Attachment, CliKind, CliTurn, TurnMessage } from '@llm-proxy/shared-types';

function mimeFromDataUrl(url: string): { mime: string; base64: string } | null {
  const m = url.match(/^data:([^;]+);base64,(.+)$/s);
  return m ? { mime: m[1]!, base64: m[2]! } : null;
}

/** Extrai texto + anexos de um content OpenAI (string ou array de partes multimodais). */
function openAiContent(content: unknown): { text: string; attachments: Attachment[] } {
  if (typeof content === 'string') return { text: content, attachments: [] };
  if (!Array.isArray(content)) return { text: '', attachments: [] };
  let text = '';
  const attachments: Attachment[] = [];
  for (const part of content) {
    if (typeof part === 'string') {
      text += part;
    } else if (part && typeof part === 'object') {
      const p = part as Record<string, unknown>;
      if (p['type'] === 'text' && typeof p['text'] === 'string') {
        text += p['text'];
      } else if (p['type'] === 'image_url') {
        const iu = p['image_url'] as { url?: string } | string | undefined;
        const url = typeof iu === 'string' ? iu : iu?.url;
        if (url) {
          const data = mimeFromDataUrl(url);
          if (data) {
            attachments.push({
              kind: 'image',
              name: `image${data.mime.includes('png') ? '.png' : '.jpg'}`,
              mime: data.mime,
              dataBase64: data.base64,
            });
          } else if (url.startsWith('/') || /^[a-zA-Z]:\\/.test(url)) {
            // caminho local na máquina
            attachments.push({ kind: 'image', name: 'image', mime: 'image/*', path: url });
          }
        }
      }
    }
  }
  return { text, attachments };
}

export interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: unknown;
}

/**
 * Mapeia um request OpenAI /v1/chat/completions para um CliTurn neutro.
 * - primeira system → systemPrompt
 * - última user → userMessage
 * - resto → history
 */
/**
 * Remove a ÚLTIMA mensagem 'user' de `rest` (mutando o array) e a retorna como
 * a userMessage do turno. Se não houver, devolve uma user vazia.
 */
function takeLastUserMessage(rest: TurnMessage[]): TurnMessage {
  const lastUserIdx = [...rest].reverse().findIndex((m) => m.role === 'user');
  if (lastUserIdx === -1) return { role: 'user', content: '' };
  const idx = rest.length - 1 - lastUserIdx;
  const [msg] = rest.splice(idx, 1);
  return msg ?? { role: 'user', content: '' };
}

export function openAiToTurn(
  kind: CliKind,
  messages: OpenAiMessage[],
  opts: { model?: string; thinking?: boolean; timeoutMs?: number },
): CliTurn {
  let systemPrompt: string | undefined;
  const rest: TurnMessage[] = [];
  for (const m of messages) {
    const parsed = openAiContent(m.content);
    if (m.role === 'system' && systemPrompt === undefined) {
      systemPrompt = parsed.text;
      continue;
    }
    rest.push({
      role: m.role,
      content: parsed.text,
      ...(parsed.attachments.length ? { attachments: parsed.attachments } : {}),
    });
  }
  const userMessage = takeLastUserMessage(rest);
  return {
    kind,
    systemPrompt,
    history: rest,
    userMessage,
    options: { model: opts.model, thinking: opts.thinking, timeoutMs: opts.timeoutMs },
  };
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: unknown;
}

/** Extrai texto de content Anthropic (string ou array de blocos). */
function anthropicContentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text ?? '') : ''))
      .join('');
  }
  return '';
}

/**
 * Mapeia um request Anthropic /v1/messages para um CliTurn neutro.
 * O system vem em campo próprio; messages têm só user/assistant.
 */
export function anthropicToTurn(
  kind: CliKind,
  system: string | undefined,
  messages: AnthropicMessage[],
  opts: { model?: string; thinking?: boolean; timeoutMs?: number },
): CliTurn {
  const rest: TurnMessage[] = messages.map((m) => ({
    role: m.role,
    content: anthropicContentToText(m.content),
  }));
  const userMessage = takeLastUserMessage(rest);
  return {
    kind,
    systemPrompt: system,
    history: rest,
    userMessage,
    options: { model: opts.model, thinking: opts.thinking, timeoutMs: opts.timeoutMs },
  };
}
