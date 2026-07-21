/**
 * Contratos compartilhados entre cli-engine, proxy, api e web.
 * Fonte da verdade dos tipos que cruzam camadas.
 */

/** As LLM CLIs que o sistema sabe detectar e operar. */
export const CLI_KINDS = [
  // 6 core (Fase 1)
  'claude',
  'codex',
  'gemini',
  'cursor',
  'opencode',
  'antigravity',
  // 2º lote — outras CLIs populares do mercado
  'copilot',
  'aider',
  'qwen',
  'amp',
  'goose',
  'grok',
  'continue',
] as const;
export type CliKind = (typeof CLI_KINDS)[number];

/** Capacidades que uma CLI/modelo pode ou não suportar. */
export interface CliCapabilities {
  /** streaming de tokens (stream-json / SSE) */
  stream: boolean;
  /** thinking / reasoning controlável */
  thinking: boolean;
  /** aceita imagem (via @path materializado) */
  images: boolean;
  /** aceita arquivos anexos (via @path) */
  files: boolean;
  /** aceita áudio (requer transcrição prévia) */
  audio: boolean;
  /** GERA imagens (tool nativa, ex.: Codex image_gen / gpt-image-2) */
  imagesOut: boolean;
  /** reporta tokens reais (só Claude hoje); senão estimamos chars/4 */
  realTokens: boolean;
  /** mantém processo vivo entre turnos (evita cold start) */
  persistentSession: boolean;
}

/** Resultado da detecção de uma CLI na máquina. */
export interface DetectedCli {
  kind: CliKind;
  present: boolean;
  /** caminho absoluto do binário resolvido (quando present) */
  binaryPath?: string;
  /** versão reportada, se conseguimos extrair */
  version?: string;
  capabilities: CliCapabilities;
  defaultModel?: string;
  models: string[];
  /** ISO timestamp da última detecção */
  lastProbedAt: string;
}

/** Papel de uma mensagem num turno. */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** Anexo materializável (imagem/arquivo/áudio) enviado num turno. */
export interface Attachment {
  kind: 'image' | 'file' | 'audio';
  /** nome original */
  name: string;
  /** mime type */
  mime: string;
  /** conteúdo em base64 (materializado em arquivo temp antes do spawn) */
  dataBase64?: string;
  /** ou um caminho já existente na máquina */
  path?: string;
}

/** Uma mensagem de um turno de conversa (formato neutro, independente de dialeto). */
export interface TurnMessage {
  role: MessageRole;
  content: string;
  attachments?: Attachment[];
}

/** Opções de execução de um turno. */
export interface TurnOptions {
  model?: string;
  /** liga/desliga thinking quando a CLI suportar */
  thinking?: boolean;
  /** teto de tokens/tempo, quando aplicável */
  timeoutMs?: number;
  /** id de sessão persistente, se reutilizando processo vivo */
  sessionId?: string;
}

/** Um turno completo a ser executado por um adapter de CLI. */
export interface CliTurn {
  kind: CliKind;
  systemPrompt?: string;
  /** histórico anterior (sem a última user) */
  history: TurnMessage[];
  /** a mensagem atual do usuário */
  userMessage: TurnMessage;
  options: TurnOptions;
}

/** Evento normalizado emitido pelo parser de stream de qualquer CLI. */
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; output: unknown }
  | { type: 'usage'; inputTokens: number; outputTokens: number; estimated: boolean }
  | { type: 'done'; finishReason: 'stop' | 'length' | 'error' | 'timeout' }
  | { type: 'error'; message: string };

/** Uso agregado de um turno. */
export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  estimated: boolean;
}
