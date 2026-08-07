import { type FunctionCapability, isRoadmapCapability } from '@llm-proxy/shared-types';

/**
 * Detecta a capacidade FUNCIONAL de um request (OpenAI/Anthropic-like) para o
 * Capability Router escolher a LLM especialista. Prioridade:
 *   1. Modalidade de ENTRADA presente (imagem/pdf/áudio/vídeo/planilha/slides)
 *      — o conteúdo manda: se veio imagem, é "analisar-imagem".
 *   2. INTENÇÃO de geração de mídia por palavras-chave (gerar imagem/HTML).
 *   3. Fallback: gerar-código se parece pedido de código; senão gerar/analisar texto.
 *
 * Conservador: começa simples; o override cap:<slug> sempre vence upstream.
 */

// Extensões: terminam em limite não-alfanumérico (espaço, aspas, fim, ?, ), ]…)
// — NÃO usar `$` puro, pois dentro de JSON/strings a extensão é seguida de aspas.
const EXT_END = `(?![a-z0-9])`;
const IMG_EXT = new RegExp(`\\.(png|jpe?g|gif|webp|bmp|svg)${EXT_END}`, 'i');
const PDF_EXT = new RegExp(`\\.pdf${EXT_END}`, 'i');
const AUDIO_EXT = new RegExp(`\\.(mp3|wav|m4a|ogg|flac|aac)${EXT_END}`, 'i');
const VIDEO_EXT = new RegExp(`\\.(mp4|mov|avi|mkv|webm)${EXT_END}`, 'i');
const XLS_EXT = new RegExp(`\\.(xlsx?|csv)${EXT_END}`, 'i');
const PPT_EXT = new RegExp(`\\.(pptx?|key)${EXT_END}`, 'i');

function collectStrings(v: unknown, out: string[], depth = 0): void {
  if (depth > 6 || v == null) return;
  if (typeof v === 'string') {
    out.push(v);
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) collectStrings(x, out, depth + 1);
    return;
  }
  if (typeof v === 'object') {
    for (const val of Object.values(v as Record<string, unknown>)) collectStrings(val, out, depth + 1);
  }
}

/** Varre o body atrás de sinais de modalidade de entrada (tipos + mimes + extensões). */
function detectInputModality(body: unknown): FunctionCapability | null {
  if (!body || typeof body !== 'object') return null;
  const json = JSON.stringify(body).toLowerCase();

  // tipos estruturados dos dialetos
  if (/"type"\s*:\s*"(image_url|image|input_image)"/.test(json)) return 'analisar-imagem';
  if (/"inlinedata"|"filedata"/.test(json) && /image\//.test(json)) return 'analisar-imagem';
  if (/application\/pdf/.test(json) || PDF_EXT.test(json)) return 'analisar-pdf';
  if (/"type"\s*:\s*"(input_audio|audio)"/.test(json) || /audio\//.test(json) || AUDIO_EXT.test(json)) return 'analisar-audio';
  if (VIDEO_EXT.test(json) || /video\//.test(json)) return 'analisar-video';
  if (XLS_EXT.test(json) || /spreadsheet|vnd\.ms-excel|officedocument\.spreadsheet/.test(json)) return 'analisar-planilha';
  if (PPT_EXT.test(json) || /presentation|officedocument\.presentation/.test(json)) return 'analisar-slides';

  // referências @path no texto (nosso formato de anexo materializado)
  const strings: string[] = [];
  collectStrings(body, strings);
  for (const s of strings) {
    if (IMG_EXT.test(s)) return 'analisar-imagem';
    if (VIDEO_EXT.test(s)) return 'analisar-video';
    if (AUDIO_EXT.test(s)) return 'analisar-audio';
    if (XLS_EXT.test(s)) return 'analisar-planilha';
    if (PPT_EXT.test(s)) return 'analisar-slides';
  }
  return null;
}

/** Última mensagem do usuário como texto puro (p/ heurística de intenção). */
function lastUserText(body: unknown): string {
  const b = body as { messages?: unknown[]; system?: unknown } | undefined;
  if (!b?.messages || !Array.isArray(b.messages)) return '';
  for (let i = b.messages.length - 1; i >= 0; i--) {
    const m = b.messages[i] as { role?: string; content?: unknown };
    if (m?.role === 'user') {
      const parts: string[] = [];
      collectStrings(m.content, parts);
      return parts.join(' ');
    }
  }
  return '';
}

// palavras-chave de INTENÇÃO (PT + EN). Cobrem imperativo/subjuntivo/infinitivo:
// gerar→gere/gera, criar→crie/cria, fazer→faça, desenhar→desenhe, produzir→produza.
// NOTA: sem `\b` — o word-boundary do JS não casa antes de acentos UTF-8 (á, ç,
// í), o que fazia "áudio"/"análise"/"função" falharem. Keywords já são específicas.
const RE_GERAR = /(ger(ar|e|a|ando)|cri(ar|e|a|ando)|fa[çc]a|desenh(ar|e|a)|produz(ir|a)|make|create|generate|draw|render|build)/i;
const RE_IMAGEM = /(imagem|imagens|figura|ilustra[çc]|logo|banner|[íi]cone|foto|picture|image|artwork|sticker|thumbnail)/i;
const RE_HTML = /(html|p[áa]gina|landing\s*page|site|website|componente\s*(web|react)|css|tailwind)/i;
const RE_AUDIO = /(áudio|audio|narra[çc]|voz|fala|tts|text[-\s]?to[-\s]?speech|locu[çc]|podcast)/i;
const RE_VIDEO = /(v[íi]deo|video|anima[çc]|clipe)/i;
const RE_CODIGO = /(c[óo]digo|code|fun[çc][ãa]o|function|classe|class|script|refator|bug|debug|implement|program)/i;
const RE_ANALISE = /(analis|avali|revis|explique|explica|explain|review|entenda|resum|summar|classif|extrai|extract|interpret)/i;

/**
 * Ponto de entrada. Retorna a FunctionCapability detectada, ou null se não deu
 * pra decidir (o chamador cai no default do router / fluxo normal).
 */
export function detectCapability(body: unknown): FunctionCapability | null {
  const cap = detectCapabilityRaw(body);
  // Nunca AUTO-detectar uma capacidade em roadmap (gerar-audio/vídeo, etc.): não há
  // fonte que a cumpra, então rotear pra ela promete uma rota inexistente e cai num
  // erro confuso ("instale/habilite a CLI"). Rebaixa pro fallback de texto — o
  // pedido ainda é atendido pela LLB de texto (que ao menos responde algo útil).
  // (O override explícito cap:<slug> continua podendo forçar — é escolha do dono.)
  if (cap && isRoadmapCapability(cap)) return 'gerar-texto';
  return cap;
}

function detectCapabilityRaw(body: unknown): FunctionCapability | null {
  // 1. Modalidade de entrada tem prioridade — o conteúdo já diz o que é.
  const modality = detectInputModality(body);
  if (modality) return modality;

  const text = lastUserText(body);
  if (!text) return null;

  // 2. Intenção de geração de MÍDIA (só quando há verbo de geração + objeto).
  const wantsGenerate = RE_GERAR.test(text);
  if (wantsGenerate && RE_IMAGEM.test(text)) return 'gerar-imagem';
  if (wantsGenerate && RE_AUDIO.test(text)) return 'gerar-audio';
  if (wantsGenerate && RE_VIDEO.test(text)) return 'gerar-video';
  if (RE_HTML.test(text) && (wantsGenerate || RE_CODIGO.test(text))) return 'gerar-html';

  // 3. Código vs texto (gerar vs analisar).
  const isCode = RE_CODIGO.test(text);
  const isAnalyze = RE_ANALISE.test(text);
  if (isCode) return wantsGenerate ? 'gerar-codigo' : isAnalyze ? 'analisar-codigo' : 'gerar-codigo';
  if (isAnalyze) return 'analisar-texto';

  // 4. Default: geração de texto.
  return 'gerar-texto';
}
