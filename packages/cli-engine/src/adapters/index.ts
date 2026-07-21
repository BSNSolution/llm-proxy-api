import type { CliKind } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { ClaudeAdapter } from './claude.js';
import { CodexAdapter } from './codex.js';
import { GeminiAdapter } from './gemini.js';
import { CursorAdapter } from './cursor.js';
import { OpenCodeAdapter } from './opencode.js';
import { AntigravityAdapter } from './antigravity.js';
import { CopilotAdapter } from './copilot.js';
import { AiderAdapter } from './aider.js';
import { QwenAdapter } from './qwen.js';
import { AmpAdapter } from './amp.js';
import { GooseAdapter } from './goose.js';
import { GrokAdapter } from './grok.js';
import { ContinueAdapter } from './continue.js';

/**
 * Registro de adapters por CLI.
 *
 * Validados E2E: claude, codex.
 * Implementados por formato documentado (não validados E2E aqui): gemini
 * (free-tier descontinuado), cursor, opencode (server-first), antigravity.
 * Ver AI/NOTES e AI/RESEARCH.
 */
const ADAPTERS: Partial<Record<CliKind, CliAdapter>> = {
  claude: new ClaudeAdapter(),
  codex: new CodexAdapter(),
  gemini: new GeminiAdapter(),
  cursor: new CursorAdapter(),
  opencode: new OpenCodeAdapter(),
  antigravity: new AntigravityAdapter(),
  // 2º lote (headless; não validados E2E — ver AI/NOTES 20/07)
  copilot: new CopilotAdapter(),
  aider: new AiderAdapter(),
  qwen: new QwenAdapter(),
  amp: new AmpAdapter(),
  goose: new GooseAdapter(),
  grok: new GrokAdapter(),
  continue: new ContinueAdapter(),
};

export function getAdapter(kind: CliKind): CliAdapter {
  const adapter = ADAPTERS[kind];
  if (!adapter) {
    throw new Error(`Adapter da CLI '${kind}' ainda não implementado (ver AI/TASKS Fase 1.3).`);
  }
  return adapter;
}

export function hasAdapter(kind: CliKind): boolean {
  return ADAPTERS[kind] !== undefined;
}

export * from './types.js';
export {
  ClaudeAdapter,
  CodexAdapter,
  GeminiAdapter,
  CursorAdapter,
  OpenCodeAdapter,
  AntigravityAdapter,
  CopilotAdapter,
  AiderAdapter,
  QwenAdapter,
  AmpAdapter,
  GooseAdapter,
  GrokAdapter,
  ContinueAdapter,
};
