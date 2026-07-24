// Fonte de execução HTTP — fala DIRETO com o provider (Anthropic/OpenAI/Gemini)
// via API key, espelhando a mesma capacidade das CLIs. Usada onde não há CLI
// local (container/VPS/CF) OU como item de fallback num combo.
//
// IMPORTANTE (identidade do produto): só providers que ESPELHAM as CLIs que já
// suportamos — não é um catálogo. Sem cookie-de-browser, sem MITM.

import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';

export type HttpProviderKind = 'anthropic' | 'openai' | 'gemini';

export interface HttpSourceConfig {
  provider: HttpProviderKind;
  apiKey: string;
  /** override do endpoint base (ex.: proxy corporativo). Default = oficial. */
  baseUrl?: string;
  model: string;
}

const DEFAULT_BASE: Record<HttpProviderKind, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
};

/** Monta o array de mensagens (system + history + user) no formato neutro→provider. */
function flattenMessages(turn: CliTurn): { role: string; content: string }[] {
  const msgs: { role: string; content: string }[] = [];
  for (const m of turn.history) msgs.push({ role: m.role === 'tool' ? 'user' : m.role, content: m.content });
  msgs.push({ role: 'user', content: turn.userMessage.content });
  return msgs;
}

/**
 * Executa um turno via HTTP e devolve eventos normalizados (mesma interface do
 * pool das CLIs). Streaming SSE quando o provider suporta; senão, um único delta.
 */
export async function* runHttpSource(
  cfg: HttpSourceConfig,
  turn: CliTurn,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): AsyncGenerator<StreamEvent> {
  const base = (cfg.baseUrl ?? DEFAULT_BASE[cfg.provider]).replace(/\/$/, '');
  const timeoutMs = opts.timeoutMs ?? 120000;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    if (cfg.provider === 'anthropic') {
      yield* runAnthropic(base, cfg, turn, ctrl.signal);
    } else if (cfg.provider === 'openai') {
      yield* runOpenAi(base, cfg, turn, ctrl.signal);
    } else {
      yield* runGemini(base, cfg, turn, ctrl.signal);
    }
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    yield { type: 'error', message: aborted ? 'Tempo limite excedido.' : `Falha na fonte HTTP: ${String((err as Error).message ?? err)}` };
    yield { type: 'done', finishReason: aborted ? 'timeout' : 'error' };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

// ── Anthropic (/v1/messages, SSE) ──────────────────────────────────────────
async function* runAnthropic(base: string, cfg: HttpSourceConfig, turn: CliTurn, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  const body = {
    model: cfg.model,
    max_tokens: 4096,
    stream: true,
    ...(turn.systemPrompt ? { system: turn.systemPrompt } : {}),
    messages: flattenMessages(turn).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
  };
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    yield { type: 'error', message: await errText(res) };
    yield { type: 'done', finishReason: 'error' };
    return;
  }
  for await (const evt of parseSse(res.body)) {
    if (evt.event === 'content_block_delta') {
      const t = evt.data?.delta?.text;
      if (typeof t === 'string') yield { type: 'delta', text: t };
    } else if (evt.event === 'message_delta' && evt.data?.usage) {
      yield { type: 'usage', inputTokens: evt.data.usage.input_tokens ?? 0, outputTokens: evt.data.usage.output_tokens ?? 0, estimated: false };
    }
  }
  yield { type: 'done', finishReason: 'stop' };
}

// ── OpenAI (/v1/chat/completions, SSE) ─────────────────────────────────────
async function* runOpenAi(base: string, cfg: HttpSourceConfig, turn: CliTurn, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  const messages = [
    ...(turn.systemPrompt ? [{ role: 'system', content: turn.systemPrompt }] : []),
    ...flattenMessages(turn),
  ];
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, stream: true, stream_options: { include_usage: true }, messages }),
    signal,
  });
  if (!res.ok || !res.body) {
    yield { type: 'error', message: await errText(res) };
    yield { type: 'done', finishReason: 'error' };
    return;
  }
  for await (const evt of parseSse(res.body)) {
    if (evt.data === '[DONE]' || evt.raw === 'data: [DONE]') break;
    const choice = evt.data?.choices?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === 'string' && delta) yield { type: 'delta', text: delta };
    if (evt.data?.usage) {
      yield { type: 'usage', inputTokens: evt.data.usage.prompt_tokens ?? 0, outputTokens: evt.data.usage.completion_tokens ?? 0, estimated: false };
    }
  }
  yield { type: 'done', finishReason: 'stop' };
}

// ── Gemini (generateContent, streaming) ────────────────────────────────────
async function* runGemini(base: string, cfg: HttpSourceConfig, turn: CliTurn, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  const contents = flattenMessages(turn).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const sys = turn.systemPrompt ? { systemInstruction: { parts: [{ text: turn.systemPrompt }] } } : {};
  const url = `${base}/v1beta/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents, ...sys }),
    signal,
  });
  if (!res.ok || !res.body) {
    yield { type: 'error', message: await errText(res) };
    yield { type: 'done', finishReason: 'error' };
    return;
  }
  for await (const evt of parseSse(res.body)) {
    const parts = evt.data?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const p of parts) if (typeof p?.text === 'string') yield { type: 'delta', text: p.text };
    }
    const um = evt.data?.usageMetadata;
    if (um) yield { type: 'usage', inputTokens: um.promptTokenCount ?? 0, outputTokens: um.candidatesTokenCount ?? 0, estimated: false };
  }
  yield { type: 'done', finishReason: 'stop' };
}

// ── util: parse SSE de um ReadableStream (Web) em eventos {event,data,raw} ──
interface SseEvent {
  event?: string;
  data?: any;
  raw: string;
}

async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      // eventos separados por \n\n
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event: string | undefined;
        let dataStr = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
        }
        if (!dataStr) continue;
        let data: any = dataStr;
        if (dataStr !== '[DONE]') {
          try {
            data = JSON.parse(dataStr);
          } catch {
            /* mantém string */
          }
        }
        yield { event, data, raw: block };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function errText(res: Response): Promise<string> {
  let detail = '';
  try {
    detail = await res.text();
  } catch {
    /* ignore */
  }
  return `Provider HTTP respondeu ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`;
}
