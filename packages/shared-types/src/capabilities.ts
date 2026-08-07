// Capacidades FUNCIONAIS — o que cada CLI/modelo consegue FAZER (não só flags
// técnicas). É a fonte da verdade da tela "Router/Workflow" inteligente: cada
// bloco de função só oferece as LLMs que realmente cumprem aquela função.

import type { CliKind } from './index.js';

/**
 * Uma função concreta que o usuário quer atribuir a uma LLM no workflow.
 * Divididas em GERAR (saída) e ANALISAR (entrada) + especiais.
 */
export const FUNCTION_CAPABILITIES = [
  // ── Gerar (saída) ──
  'gerar-texto',
  'gerar-codigo',
  'gerar-html',
  'gerar-imagem',
  'gerar-audio', // TTS
  'gerar-video',
  // ── Analisar (entrada) ──
  'analisar-texto',
  'analisar-codigo',
  'analisar-imagem',
  'analisar-video',
  'analisar-audio',
  'analisar-pdf',
  'analisar-planilha', // excel/csv
  'analisar-slides', // pptx
  // ── Especiais ──
  'transcrever-audio', // STT
  'web-search',
  'embeddings',
] as const;

export type FunctionCapability = (typeof FUNCTION_CAPABILITIES)[number];

/** Metadados de exibição de cada função (rótulo PT + grupo + ícone lucide). */
export interface FunctionCapabilityMeta {
  slug: FunctionCapability;
  label: string;
  group: 'gerar' | 'analisar' | 'especial';
  /** nome do ícone lucide-react (a UI resolve) */
  icon: string;
  /** modalidade de entrada que o request precisa carregar p/ detecção automática */
  inputModality?: 'image' | 'video' | 'audio' | 'pdf' | 'spreadsheet' | 'slides' | 'text';
  hint: string;
  /**
   * Situação da capacidade hoje:
   *  - 'ready'   (default): há CLI que cumpre e é acessível pelo proxy (router/REST).
   *  - 'roadmap': ainda NÃO há CLI que cumpra nem endpoint dedicado — a UI mostra
   *               "Em breve" em vez de um seletor morto (evita prometer o que não entrega).
   * Ex. roadmap: gerar-áudio/vídeo (nenhuma CLI gera), embeddings e transcrever-áudio
   * (precisam de /v1/embeddings e /v1/audio/transcriptions, ainda não implementados).
   */
  status?: 'ready' | 'roadmap';
}

export const FUNCTION_CAPABILITY_META: Record<FunctionCapability, FunctionCapabilityMeta> = {
  'gerar-texto': { slug: 'gerar-texto', label: 'Gerar texto', group: 'gerar', icon: 'Type', hint: 'Redação, respostas, resumos.' },
  'gerar-codigo': { slug: 'gerar-codigo', label: 'Gerar código', group: 'gerar', icon: 'Code2', hint: 'Escrever/editar código em qualquer linguagem.' },
  'gerar-html': { slug: 'gerar-html', label: 'Gerar página HTML', group: 'gerar', icon: 'FileCode2', hint: 'Páginas/landing/componentes HTML+CSS.' },
  'gerar-imagem': { slug: 'gerar-imagem', label: 'Gerar imagem', group: 'gerar', icon: 'ImagePlus', hint: 'Criar imagens (ex.: Codex + GPT Image).' },
  'gerar-audio': { slug: 'gerar-audio', label: 'Gerar áudio (TTS)', group: 'gerar', icon: 'AudioLines', hint: 'Texto → fala.', status: 'roadmap' },
  'gerar-video': { slug: 'gerar-video', label: 'Gerar vídeo', group: 'gerar', icon: 'Clapperboard', hint: 'Criar vídeo a partir de prompt.', status: 'roadmap' },

  'analisar-texto': { slug: 'analisar-texto', label: 'Analisar texto', group: 'analisar', icon: 'FileText', inputModality: 'text', hint: 'Interpretar/classificar/extrair de texto.' },
  'analisar-codigo': { slug: 'analisar-codigo', label: 'Analisar código', group: 'analisar', icon: 'FileSearch', inputModality: 'text', hint: 'Revisar/auditar/explicar código.' },
  'analisar-imagem': { slug: 'analisar-imagem', label: 'Analisar imagem', group: 'analisar', icon: 'Image', inputModality: 'image', hint: 'Descrever/entender uma imagem (visão).' },
  'analisar-video': { slug: 'analisar-video', label: 'Analisar vídeo', group: 'analisar', icon: 'Video', inputModality: 'video', hint: 'Entender conteúdo de vídeo.' },
  'analisar-audio': { slug: 'analisar-audio', label: 'Analisar áudio', group: 'analisar', icon: 'Volume2', inputModality: 'audio', hint: 'Entender conteúdo de áudio.' },
  'analisar-pdf': { slug: 'analisar-pdf', label: 'Analisar PDF', group: 'analisar', icon: 'FileType2', inputModality: 'pdf', hint: 'Ler/extrair de documentos PDF.' },
  'analisar-planilha': { slug: 'analisar-planilha', label: 'Analisar planilha', group: 'analisar', icon: 'Table2', inputModality: 'spreadsheet', hint: 'Excel/CSV: entender dados tabulares.' },
  'analisar-slides': { slug: 'analisar-slides', label: 'Analisar slides', group: 'analisar', icon: 'Presentation', inputModality: 'slides', hint: 'PowerPoint/PPTX: entender apresentação.' },

  'transcrever-audio': { slug: 'transcrever-audio', label: 'Transcrever áudio (STT)', group: 'especial', icon: 'Mic', inputModality: 'audio', hint: 'Áudio → texto.', status: 'roadmap' },
  'web-search': { slug: 'web-search', label: 'Busca na web', group: 'especial', icon: 'Globe', hint: 'Pesquisar na internet.' },
  embeddings: { slug: 'embeddings', label: 'Embeddings', group: 'especial', icon: 'Boxes', hint: 'Vetorizar texto p/ busca semântica.', status: 'roadmap' },
};

// ── Matriz: quais funções cada CLI cumpre ──────────────────────────────────
// Derivada das flags técnicas (images/files/audio/imagesOut...) + conhecimento
// específico por CLI. Só listamos o que é real hoje. Análise de planilha/pdf/
// slides é possível quando a CLI aceita arquivos (`files`) — materializamos o
// anexo e a LLM lê. Vídeo nativo só o Gemini. Gerar imagem só o Codex (gpt-image).
//
// IMPORTANTE: toda CLI que gera texto também "gera código/html/analisa texto/
// analisa código" (é a base). O que varia é multimodal e geração de mídia.

/** Funções que TODA CLI text-capaz cumpre. */
const TEXT_BASE: FunctionCapability[] = ['gerar-texto', 'gerar-codigo', 'gerar-html', 'analisar-texto', 'analisar-codigo'];

/** Funções extras por CLI (multimodal / geração de mídia / especiais). */
const CLI_EXTRA_CAPABILITIES: Record<CliKind, FunctionCapability[]> = {
  // Claude: visão + arquivos (pdf/planilha/slides via anexo). Sem geração de mídia.
  claude: ['analisar-imagem', 'analisar-pdf', 'analisar-planilha', 'analisar-slides'],
  // Codex: visão + arquivos + GERA IMAGEM (gpt-image-2, validado).
  codex: ['analisar-imagem', 'analisar-pdf', 'analisar-planilha', 'analisar-slides', 'gerar-imagem'],
  // Gemini: visão + VÍDEO nativo + arquivos + web-search.
  gemini: ['analisar-imagem', 'analisar-video', 'analisar-pdf', 'analisar-planilha', 'analisar-slides', 'web-search'],
  // Cursor: visão + arquivos.
  cursor: ['analisar-imagem', 'analisar-pdf', 'analisar-planilha', 'analisar-slides'],
  // OpenCode: visão + arquivos.
  opencode: ['analisar-imagem', 'analisar-pdf', 'analisar-planilha', 'analisar-slides'],
  // Antigravity: visão + arquivos.
  antigravity: ['analisar-imagem', 'analisar-pdf', 'analisar-planilha', 'analisar-slides'],
  // Demais (2º lote) = texto puro por ora (sem multimodal confirmado).
  copilot: [],
  aider: [],
  qwen: [],
  amp: [],
  goose: [],
  grok: [],
  continue: [],
};

/** Uma capacidade está em roadmap (sem CLI que cumpra nem endpoint dedicado)? */
export function isRoadmapCapability(fn: FunctionCapability): boolean {
  return FUNCTION_CAPABILITY_META[fn].status === 'roadmap';
}

/** Conjunto (Set) de funções que uma CLI cumpre. */
export function capabilitiesForCli(kind: CliKind): Set<FunctionCapability> {
  return new Set<FunctionCapability>([...TEXT_BASE, ...(CLI_EXTRA_CAPABILITIES[kind] ?? [])]);
}

/** Uma CLI cumpre a função? */
export function cliSupportsFunction(kind: CliKind, fn: FunctionCapability): boolean {
  return capabilitiesForCli(kind).has(fn);
}

/**
 * Todas as CLIs que cumprem uma função (para a UI listar opções válidas por bloco).
 * Restrição opcional a um conjunto de CLIs disponíveis (instaladas/habilitadas).
 */
export function clisForFunction(fn: FunctionCapability, available?: CliKind[]): CliKind[] {
  const pool = available ?? (Object.keys(CLI_EXTRA_CAPABILITIES) as CliKind[]);
  return pool.filter((k) => cliSupportsFunction(k, fn));
}

/** Matriz completa serializável p/ a API `/api/capabilities`. */
export interface CapabilityMatrix {
  functions: FunctionCapabilityMeta[];
  /** por CLI: lista de funções suportadas */
  byCli: Record<string, FunctionCapability[]>;
}

export function buildCapabilityMatrix(available?: CliKind[]): CapabilityMatrix {
  const pool = available ?? (Object.keys(CLI_EXTRA_CAPABILITIES) as CliKind[]);
  const byCli: Record<string, FunctionCapability[]> = {};
  for (const k of pool) byCli[k] = [...capabilitiesForCli(k)];
  return {
    functions: FUNCTION_CAPABILITIES.map((f) => FUNCTION_CAPABILITY_META[f]),
    byCli,
  };
}
