import type { CliCapabilities, CliKind } from '@llm-proxy/shared-types';

/**
 * Ícone Iconify por CLI (https://icon-sets.iconify.design).
 * Usado na UI (cards de Setup/Configurações).
 */
export const CLI_ICONS: Record<CliKind, string> = {
  claude: 'ri:anthropic-fill',
  codex: 'ri:openai-fill',
  gemini: 'ri:gemini-fill',
  cursor: 'simple-icons:cursor',
  opencode: 'simple-icons:opencode',
  antigravity: 'bxl:google-antigravity',
  // 2º lote (só ícones presentes nos sets offline ri/simple-icons/bxl)
  copilot: 'simple-icons:githubcopilot',
  aider: 'ri:robot-2-fill',
  qwen: 'simple-icons:qwen',
  amp: 'simple-icons:sourcegraph',
  goose: 'ri:terminal-box-fill',
  grok: 'ri:twitter-x-fill',
  continue: 'ri:code-box-fill',
};

/**
 * Metadados estáticos por CLI: nome do binário a probar, args de versão,
 * capabilities conhecidas e modelos default. Base para detecção e adapters.
 *
 * Fontes: pesquisa de viabilidade (AI/RESEARCH/17_07_2026-viabilidade_clis_headless_e_proxies_existentes.md).
 */
export interface CliMeta {
  kind: CliKind;
  /** binário no PATH */
  binary: string;
  /**
   * Nomes alternativos do binário, tentados na ordem se `binary` não resolver.
   * Ex.: Cursor CLI expõe `agent` (docs atuais) ou `cursor-agent` (legado).
   */
  binaryAliases?: string[];
  /** args p/ obter versão (probe leve) */
  versionArgs: string[];
  label: string;
  capabilities: CliCapabilities;
  defaultModel?: string;
  models: string[];
}

export const CLI_REGISTRY: Record<CliKind, CliMeta> = {
  claude: {
    kind: 'claude',
    binary: 'claude',
    versionArgs: ['--version'],
    label: 'Claude Code',
    capabilities: {
      stream: true,
      thinking: true,
      images: true,
      files: true,
      audio: false,
      imagesOut: false,
      realTokens: true, // único que reporta tokens reais (evento result)
      persistentSession: true, // --input-format stream-json
    },
    // O Claude Code aceita aliases (opus/sonnet/haiku/fable) OU o ID completo
    // (ex.: claude-opus-4-8). Lista conforme doc oficial (skill claude-api).
    defaultModel: 'sonnet',
    models: [
      'sonnet',
      'opus',
      'haiku',
      'fable',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-5',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
      'claude-fable-5',
    ],
  },
  codex: {
    kind: 'codex',
    binary: 'codex',
    versionArgs: ['--version'],
    label: 'Codex CLI',
    capabilities: {
      stream: true, // codex exec --json
      thinking: true, // reasoning effort via config
      images: true,
      files: true,
      audio: false,
      imagesOut: true, // tool nativa image_gen (gpt-image-2) — validado 17/07/2026
      realTokens: true, // turn.completed.usage traz tokens reais (validado 17/07/2026)
      persistentSession: false, // usa resume, não sessão viva bidirecional
    },
    // Em conta ChatGPT o Codex usa o modelo default da conta; 'gpt-5-codex' explícito
    // é rejeitado. Mantemos 'default' como alias seguro. Ver AI/NOTES 17/07/2026.
    defaultModel: 'default',
    models: ['default'],
  },
  gemini: {
    kind: 'gemini',
    binary: 'gemini',
    versionArgs: ['--version'],
    label: 'Gemini CLI',
    capabilities: {
      stream: true, // --output-format stream-json
      thinking: true, // thinking budget
      images: true,
      files: true,
      audio: false,
      imagesOut: false,
      realTokens: false,
      persistentSession: false,
    },
    defaultModel: 'gemini-2.5-pro',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3-pro'],
  },
  cursor: {
    kind: 'cursor',
    // Docs atuais usam `agent`; material antigo usa `cursor-agent`. Detectar ambos.
    binary: 'cursor-agent',
    binaryAliases: ['agent'],
    versionArgs: ['--version'],
    label: 'Cursor CLI',
    capabilities: {
      stream: true, // --output-format stream-json
      thinking: false,
      images: true,
      files: true,
      audio: false,
      imagesOut: false,
      realTokens: false,
      persistentSession: false,
    },
    defaultModel: 'auto',
    models: ['auto'],
  },
  opencode: {
    kind: 'opencode',
    binary: 'opencode',
    versionArgs: ['--version'],
    label: 'OpenCode',
    capabilities: {
      stream: true, // via server/bridge
      thinking: false,
      images: true,
      files: true,
      audio: false,
      imagesOut: false,
      realTokens: false,
      persistentSession: true, // opencode serve mantém estado
    },
    defaultModel: 'auto',
    models: ['auto'],
  },
  antigravity: {
    kind: 'antigravity',
    // Binário real é `agy` (Go); doc oficial antigravity.google. `antigravity` é alias defensivo.
    binary: 'agy',
    binaryAliases: ['antigravity'],
    versionArgs: ['--version'],
    label: 'Antigravity CLI',
    capabilities: {
      stream: true,
      thinking: true,
      images: true,
      files: true,
      audio: false,
      imagesOut: false,
      realTokens: false,
      persistentSession: false,
    },
    defaultModel: 'auto',
    models: ['auto'],
  },

  // ---------------- 2º lote: outras CLIs do mercado ----------------
  // Capabilities conservadoras (texto, sem tokens reais salvo indicado) — refinar ao validar E2E.

  copilot: {
    kind: 'copilot',
    binary: 'copilot',
    versionArgs: ['--version'],
    label: 'GitHub Copilot CLI',
    capabilities: {
      stream: false,
      thinking: false,
      images: false,
      files: true,
      audio: false,
      imagesOut: false,
      realTokens: false,
      persistentSession: false,
    },
    defaultModel: 'auto',
    models: ['auto'],
  },
  aider: {
    kind: 'aider',
    binary: 'aider',
    versionArgs: ['--version'],
    label: 'Aider',
    capabilities: {
      stream: false,
      thinking: false,
      images: false,
      files: true,
      audio: false,
      imagesOut: false,
      realTokens: false,
      persistentSession: false,
    },
    // Aider é multi-provider por env; o modelo vem da flag/config, não de um default fixo.
    defaultModel: 'auto',
    models: ['auto'],
  },
  qwen: {
    kind: 'qwen',
    binary: 'qwen',
    versionArgs: ['--version'],
    label: 'Qwen Code',
    capabilities: {
      stream: true, // --output-format stream-json (NDJSON)
      thinking: false,
      images: false,
      files: true,
      audio: false,
      imagesOut: false,
      realTokens: true, // usage no message object
      persistentSession: false,
    },
    defaultModel: 'auto',
    models: ['auto', 'qwen3-coder-plus'],
  },
  amp: {
    kind: 'amp',
    binary: 'amp',
    versionArgs: ['--version'],
    label: 'Amp',
    capabilities: {
      stream: true, // --stream-json (schema Claude Code)
      thinking: false,
      images: false,
      files: true,
      audio: false,
      imagesOut: false,
      realTokens: true, // usage cumulativo no result
      persistentSession: false,
    },
    // Amp escolhe o modelo automaticamente por "mode" — sem seleção por flag.
    defaultModel: 'auto',
    models: ['auto'],
  },
  goose: {
    kind: 'goose',
    binary: 'goose',
    versionArgs: ['--version'],
    label: 'Goose',
    capabilities: {
      stream: false,
      thinking: false,
      images: false,
      files: true,
      audio: false,
      imagesOut: false,
      realTokens: false,
      persistentSession: false,
    },
    defaultModel: 'auto',
    models: ['auto'],
  },
  grok: {
    kind: 'grok',
    binary: 'grok',
    versionArgs: ['--version'],
    label: 'Grok CLI',
    capabilities: {
      stream: true, // --output-format streaming-json (NDJSON)
      thinking: false,
      images: false,
      files: true,
      audio: false,
      imagesOut: false,
      realTokens: false,
      persistentSession: false,
    },
    defaultModel: 'auto',
    models: ['auto'],
  },
  continue: {
    kind: 'continue',
    binary: 'cn',
    versionArgs: ['--version'],
    label: 'Continue CLI',
    capabilities: {
      stream: false,
      thinking: false,
      images: false,
      files: true,
      audio: false,
      imagesOut: false,
      realTokens: false,
      persistentSession: false,
    },
    defaultModel: 'auto',
    models: ['auto'],
  },
};

export const ALL_CLI_METAS: CliMeta[] = Object.values(CLI_REGISTRY);
