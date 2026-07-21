/**
 * Estimativa de tokens quando a CLI não reporta tokens reais.
 * Aproximação padrão da indústria: ~4 chars por token.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
