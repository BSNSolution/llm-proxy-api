// @llm-proxy/token-saver — comprime saídas verbosas de ferramentas (tool_result)
// antes de irem ao LLM, economizando tokens de INPUT sem perder o essencial.
// Safe-by-design: se um filtro falha ou aumenta o texto, mantém o original.
//
// Também expõe os "system prompts" de terseness (Caveman/Ponytail) que reduzem
// tokens de OUTPUT. Inspirado no 9Router (RTK Apache-2.0, Caveman, Ponytail) —
// implementação própria em TS.

import { dedupLog, gitDiff, gitStatus, grep, ls, smartTruncate, tree, type Filter } from './filters.js';

const DETECT_WINDOW = 1024;

const RE_GIT_DIFF = /^diff --git |^@@ /m;
const RE_GIT_STATUS = /^On branch |^nothing to commit|^Changes (not |to be )|^Untracked files:/m;
const RE_GREP = /^[^:\n]+:\d+:/m;
const RE_TREE = /[├└]──|│  /;
const RE_LS = /^total \d+$|^[-dl][rwx-]{9}/m;

/** Escolhe o filtro apropriado olhando o início do texto. null = sem filtro. */
export function autoDetectFilter(text: string): Filter | null {
  const head = text.length > DETECT_WINDOW ? text.slice(0, DETECT_WINDOW) : text;
  if (RE_GIT_DIFF.test(head)) return gitDiff;
  if (RE_GIT_STATUS.test(head)) return gitStatus;
  if (RE_GREP.test(head)) return grep;
  if (RE_TREE.test(head)) return tree;
  if (RE_LS.test(head)) return ls;

  const lineCount = text.split('\n').length;
  if (lineCount >= 40) return dedupLog; // logs/saídas longas repetitivas
  if (lineCount >= 120) return smartTruncate;
  return null;
}

export interface CompressResult {
  text: string;
  applied: string | null; // nome do filtro aplicado, ou null
  savedChars: number;
}

/**
 * Comprime UM tool_result. Só aplica se o resultado for MENOR (safe-by-design).
 * Nunca lança — em erro, devolve o original.
 */
export function compressToolResult(text: string): CompressResult {
  if (!text || text.length < 200) return { text, applied: null, savedChars: 0 };
  const filter = autoDetectFilter(text);
  if (!filter) return { text, applied: null, savedChars: 0 };
  try {
    const out = filter(text);
    if (out.length < text.length) {
      return { text: out, applied: filter.name, savedChars: text.length - out.length };
    }
  } catch {
    /* falhou — mantém original */
  }
  return { text, applied: null, savedChars: 0 };
}

/**
 * Aplica compressão a todos os tool_result de uma lista de mensagens (formato
 * neutro). Mexe só em role 'tool'/'function' ou blocos type 'tool_result'.
 * Devolve as mensagens (novo array) + total de chars economizados.
 */
export function compressMessages<T extends { role?: string; content?: unknown }>(
  messages: T[],
): { messages: T[]; savedChars: number } {
  let saved = 0;
  const out = messages.map((m) => {
    // role tool/function com content string
    if ((m.role === 'tool' || m.role === 'function') && typeof m.content === 'string') {
      const r = compressToolResult(m.content);
      saved += r.savedChars;
      return r.applied ? { ...m, content: r.text } : m;
    }
    // content array com blocos tool_result (Anthropic-like)
    if (Array.isArray(m.content)) {
      let changed = false;
      const blocks = (m.content as Array<Record<string, unknown>>).map((b) => {
        if (b && b['type'] === 'tool_result') {
          const c = b['content'];
          if (typeof c === 'string') {
            const r = compressToolResult(c);
            saved += r.savedChars;
            if (r.applied) {
              changed = true;
              return { ...b, content: r.text };
            }
          }
        }
        return b;
      });
      return changed ? { ...m, content: blocks } : m;
    }
    return m;
  });
  return { messages: out, savedChars: saved };
}

export * from './filters.js';
export * from './terseness.js';
