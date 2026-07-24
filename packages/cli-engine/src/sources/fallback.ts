// Fallback multi-tier: executa uma lista ordenada de fontes (combo) tentando a
// próxima quando a atual falha de forma "fallback-ável" (quota/rate/5xx/CLI
// indisponível/timeout). Erros do USUÁRIO (request inválido) NÃO fazem fallback
// — inspirado no checkFallbackError do 9Router.

import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import { runSource, type RunSourceOptions, type SourceRef } from './index.js';

/**
 * Decide se uma mensagem de erro justifica cair para o próximo item do combo.
 * Conservador: na dúvida, considera fallback-ável (queremos "nunca parar"),
 * EXCETO quando é claramente erro do cliente (400/validação/prompt).
 */
export function isFallbackableError(message: string): boolean {
  const m = message.toLowerCase();
  // Erros do usuário — NÃO adianta trocar de modelo.
  const userErrors = [
    'invalid request',
    'malformed',
    'validation',
    'unsupported',
    'prompt is too long',
    'context length',
    'max_tokens',
    'bad request',
    ' 400',
    'não permitido', // allowlist do próprio proxy
    'not allowed',
  ];
  if (userErrors.some((s) => m.includes(s))) return false;

  // Sinais claros de fallback (quota/rate/indisponível/timeout/servidor).
  const fallbackSignals = [
    'quota',
    'rate limit',
    'rate-limit',
    'too many requests',
    ' 429',
    ' 500',
    ' 502',
    ' 503',
    ' 529',
    'overloaded',
    'unavailable',
    'timeout',
    'tempo limite',
    'not logged in',
    'not found', // CLI/binário ausente
    'enoent',
    'sem api key',
    'failed to spawn',
  ];
  if (fallbackSignals.some((s) => m.includes(s))) return true;

  // Default: fallback-ável (prioriza continuidade).
  return true;
}

export interface FallbackResult {
  /** índice do item que efetivamente respondeu (ou o último tentado se todos falharam) */
  usedIndex: number;
  usedRef: SourceRef | null;
  finishReason: 'stop' | 'length' | 'error' | 'timeout';
  /** erros dos itens que falharam antes (para debug/telemetria) */
  attempts: { ref: SourceRef; error: string }[];
}

/**
 * Executa `refs` em ordem com fallback. Faz "buffer" do primeiro item: se ele
 * falhar ANTES de emitir qualquer delta, tenta o próximo sem o cliente perceber.
 * Se já emitiu deltas, um erro no meio é terminal (não dá pra "refazer" o começo
 * do stream que o cliente já recebeu). Repassa os eventos via `onEvent`.
 */
export async function runWithFallback(
  refs: SourceRef[],
  turn: CliTurn,
  onEvent: (ev: StreamEvent) => void | Promise<void>,
  opts: RunSourceOptions = {},
): Promise<FallbackResult> {
  const attempts: { ref: SourceRef; error: string }[] = [];

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]!;
    const isLast = i === refs.length - 1;
    let emittedDelta = false;
    let errorMsg: string | null = null;
    let finishReason: FallbackResult['finishReason'] = 'stop';
    const buffered: StreamEvent[] = [];

    for await (const ev of runSource(ref, turn, opts)) {
      if (ev.type === 'error') {
        errorMsg = ev.message;
        // não repassa o erro ainda — pode haver fallback
        continue;
      }
      if (ev.type === 'done') {
        finishReason = ev.finishReason;
        if (finishReason === 'error' || finishReason === 'timeout') {
          if (!errorMsg) errorMsg = `Falha (${finishReason}).`;
          break;
        }
        // sucesso: garante que os buffered saíram
        for (const b of buffered.splice(0)) await onEvent(b);
        await onEvent(ev);
        return { usedIndex: i, usedRef: ref, finishReason, attempts };
      }
      // delta/thinking/usage
      if (!emittedDelta && ev.type === 'delta') {
        // primeiro delta: descarrega o que veio antes (thinking/usage) + este
        emittedDelta = true;
        for (const b of buffered.splice(0)) await onEvent(b);
        await onEvent(ev);
      } else if (emittedDelta) {
        await onEvent(ev);
      } else {
        buffered.push(ev); // segura até saber se há delta (permite fallback limpo)
      }
    }

    // Chegou aqui = terminou o loop. Sucesso já teria retornado acima.
    if (errorMsg) {
      attempts.push({ ref, error: errorMsg });
      const canFallback = !emittedDelta && !isLast && isFallbackableError(errorMsg);
      if (canFallback) continue; // tenta o próximo, cliente não viu nada
      // terminal: repassa o que tiver + erro + done
      for (const b of buffered.splice(0)) await onEvent(b);
      await onEvent({ type: 'error', message: errorMsg });
      await onEvent({ type: 'done', finishReason: emittedDelta ? 'stop' : 'error' });
      return { usedIndex: i, usedRef: ref, finishReason: 'error', attempts };
    }

    // terminou sem erro e sem done explícito (adapters de texto puro): descarrega
    for (const b of buffered.splice(0)) await onEvent(b);
    await onEvent({ type: 'done', finishReason });
    return { usedIndex: i, usedRef: ref, finishReason, attempts };
  }

  // lista vazia
  await onEvent({ type: 'error', message: 'Combo sem itens executáveis.' });
  await onEvent({ type: 'done', finishReason: 'error' });
  return { usedIndex: -1, usedRef: null, finishReason: 'error', attempts };
}
