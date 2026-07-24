// Terseness prompts — reduzem tokens de SAÍDA injetando um estilo de resposta
// mais enxuto. Inspirado no Caveman/Ponytail do 9Router; texto próprio.
//
// Caveman: respostas técnicas porém telegráficas (menos "encheção").
// Ponytail: "dev sênior preguiçoso" — código mínimo, YAGNI, sem abstração à toa.

export type TersenessMode = 'off' | 'caveman' | 'ponytail';
export type TersenessLevel = 'lite' | 'full' | 'ultra';

const CAVEMAN: Record<TersenessLevel, string> = {
  lite: 'Seja conciso. Prefira frases curtas e diretas. Mantenha a substância técnica; corte enrolação, saudações e repetições.',
  full: 'Responda de forma telegráfica e densa: bullet points, sem introdução nem conclusão, sem repetir a pergunta. Mantenha 100% da precisão técnica; elimine palavras de preenchimento.',
  ultra:
    'Máxima concisão. Só o essencial técnico, estilo notas: fragmentos, sem prosa, sem cortesias, sem meta-comentário. Nunca sacrifique correção — apenas o excesso de palavras.',
};

const PONYTAIL: Record<TersenessLevel, string> = {
  lite: 'Escreva o código mínimo que resolve o pedido. Prefira a biblioteca padrão a novas dependências. Cite brevemente a alternativa mais simples se existir.',
  full: 'Aja como um dev sênior enxuto (YAGNI): entregue o menor diff que funciona — stdlib > nativo > deps existentes > one-liner. Sem abstrações "por precaução", sem scaffolding extra.',
  ultra:
    'YAGNI extremo: primeiro tente deletar/reduzir; entregue o one-liner se resolver; questione requisitos supérfluos. Nunca abra mão de validação de entrada, tratamento de erro, segurança ou do que foi explicitamente pedido.',
};

/** Retorna o texto de system prompt a injetar (ou '' quando off). */
export function tersenessPrompt(mode: TersenessMode, level: TersenessLevel = 'full'): string {
  if (mode === 'caveman') return CAVEMAN[level];
  if (mode === 'ponytail') return PONYTAIL[level];
  return '';
}

/** Injeta o prompt de terseness num systemPrompt existente (prepend). */
export function withTerseness(systemPrompt: string | undefined, mode: TersenessMode, level: TersenessLevel = 'full'): string | undefined {
  const t = tersenessPrompt(mode, level);
  if (!t) return systemPrompt;
  return systemPrompt ? `${t}\n\n${systemPrompt}` : t;
}
