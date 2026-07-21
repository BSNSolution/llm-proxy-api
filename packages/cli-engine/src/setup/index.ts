/**
 * Setup wizard: instalação e login das LLM CLIs.
 * - types: contratos (recipes + eventos)
 * - recipes: receitas reais por CLI (install/login)
 * - plan: seleção por SO + plano exibível antes de executar
 * - installer: roda a instalação com stream de progresso
 * - login-runner: conduz o login (parser + detecção de sucesso + injeção de código)
 */
export * from './types.js';
export * from './recipes.js';
export * from './plan.js';
export * from './installer.js';
export * from './login-runner.js';
