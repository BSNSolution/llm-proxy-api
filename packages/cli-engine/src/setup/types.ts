import type { CliKind } from '@llm-proxy/shared-types';
import type { OsKind } from '../platform/index.js';

/**
 * Modelo de "setup recipe": como INSTALAR e LOGAR cada LLM CLI.
 * Espelha o padrão dos adapters (buildArgs/parseLine), mas para o fluxo de
 * onboarding: instalar o binário faltante e conduzir o login.
 *
 * Toda execução reusa a camada multi-OS de platform/ (spawnCommand, killTree,
 * buildCliEnv). Fontes das receitas: AI/NOTES/17_07_2026-receitas_install_login_*.
 */

/** Gerenciador/instalador permitido (allowlist de segurança). */
export type PackageManager = 'npm' | 'pnpm' | 'brew' | 'pip' | 'pipx' | 'curl' | 'powershell';

/** Um passo de instalação: um comando concreto a rodar. */
export interface InstallStep {
  /** rótulo humano exibido na UI (ex.: "Instalar via npm") */
  label: string;
  /** o gerenciador — validado contra a allowlist antes de spawnar */
  manager: PackageManager;
  /** binário do comando (ex.: "npm", "brew", "bash") — resolvido no PATH */
  command: string;
  /** argumentos fixos (nunca interpolar input do usuário) */
  args: string[];
  /**
   * Para instaladores via script (curl|bash / irm|iex), o passo pode precisar
   * de shell. Mantemos o comando/args explícitos; o runner decide a invocação
   * segura por SO. Ver installer.ts.
   */
  viaScript?: boolean;
}

/**
 * Receita de instalação de uma CLI, com fallbacks ordenados por SO
 * (preferido primeiro). O wizard mostra o comando escolhido e só roda após
 * confirmação do usuário.
 */
export interface InstallRecipe {
  /** steps por SO; cada array é uma cadeia de fallbacks (tenta o 1º; se indisponível, o próximo) */
  byOs: Partial<Record<OsKind, InstallStep[]>>;
  /** observação exibida na UI (ex.: "requer Node 22+", "não use sudo") */
  note?: string;
}

/** Método pelo qual a CLI autentica. */
export type LoginMethod =
  | 'oauth-browser' // abre o browser; pode imprimir URL (fallback) ou não
  | 'device-code' // imprime um código p/ colar em outra tela
  | 'paste-token' // pede colar um token/API key
  | 'api-key-env' // basta a env var (sem fluxo interativo)
  | 'run-interactive'; // roda a CLI e escolhe no menu (ex.: gemini)

/** Tipo de evento normalizado emitido durante o login. */
export type LoginEvent =
  | { type: 'progress'; line: string } // linha crua de stdout/stderr (log ao vivo)
  | { type: 'auth-url'; url: string } // URL de OAuth p/ o usuário abrir/clicar
  | { type: 'auth-code'; code: string } // device code p/ o usuário colar em outro lugar
  | { type: 'awaiting-input'; prompt: string; secret: boolean } // a CLI espera token/código → UI mostra campo
  | { type: 'logged-in' } // sucesso confirmado (arquivo de credencial e/ou string)
  | { type: 'error'; message: string }
  | { type: 'done' }; // processo encerrou (com ou sem sucesso; ver se veio logged-in antes)

/**
 * Parser do stdout do login: recebe UMA linha e devolve eventos.
 * Deve extrair auth-url/auth-code/awaiting-input quando reconhecer os padrões
 * documentados; retornar [] quando a linha não casar. NÃO inventar regex de URL
 * onde não há doc — nesses casos confiar no successDetector por arquivo.
 */
export type LoginLineParser = (line: string) => LoginEvent[];

export interface LoginRecipe {
  method: LoginMethod;
  /**
   * Comando de login (quando existe subcomando dedicado, ex.: `codex login`).
   * Quando `undefined`, o login é "rodar a própria CLI" (ex.: claude, gemini) —
   * o runner usa o binário da CLI com `runArgs`.
   */
  command?: string;
  /** args do login (ou da execução interativa da CLI) */
  args?: string[];
  /** parser das linhas do login (extrai url/código/prompt) */
  parseLine?: LoginLineParser;
  /**
   * Detector de sucesso independente do stdout: caminho(s) de arquivo de
   * credencial (relativos ao HOME) cuja existência indica login concluído.
   * Ex.: ['.codex/auth.json'], ['.gemini/oauth_creds.json'], ['.claude.json'].
   * O runner faz polling desses arquivos enquanto o login roda.
   */
  successFiles?: string[];
  /**
   * Comando opcional que confirma o login (ex.: `codex login status`,
   * `claude doctor`) + regex que, casada no stdout, significa "logado".
   */
  statusCheck?: { command: string; args: string[]; okPattern: RegExp };
  /** regex de sucesso no stdout do próprio login (reforço), ex.: /Login successful/i */
  successPattern?: RegExp;
  /** env var de API key p/ modo não-interativo (ex.: ANTHROPIC_API_KEY) */
  apiKeyEnv?: string;
  /** dica exibida na UI sobre o fluxo (copy de leigo) */
  hint?: string;
}

/** Receita completa de setup de uma CLI. */
export interface SetupRecipe {
  kind: CliKind;
  install: InstallRecipe;
  login: LoginRecipe;
}

/** Evento normalizado da INSTALAÇÃO (stream de progresso). */
export type InstallEvent =
  | { type: 'progress'; line: string }
  | { type: 'done'; installed: boolean; version?: string }
  | { type: 'error'; message: string };
