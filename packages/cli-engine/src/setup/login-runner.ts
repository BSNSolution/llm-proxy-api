import { access, stat } from 'node:fs/promises';
import type { ChildProcess } from 'node:child_process';
import type { CliKind } from '@llm-proxy/shared-types';
import { homeFile, killTree, runProbe, spawnCli } from '../platform/index.js';
import { getSetupRecipe } from './recipes.js';
import type { LoginEvent, LoginRecipe } from './types.js';

const LOGIN_TIMEOUT_MS = 5 * 60_000; // 5 min p/ concluir o OAuth
const CRED_POLL_MS = 1500;

/** Existe e foi modificado recentemente (evita falso-positivo de credencial antiga). */
async function credentialFresh(relPath: string, sinceMs: number): Promise<boolean> {
  try {
    const p = homeFile(relPath);
    await access(p);
    const s = await stat(p);
    return s.mtimeMs >= sinceMs;
  } catch {
    return false;
  }
}

/** Arquivo de credencial existe (qualquer mtime) — indica login prévio. Read-only. */
async function credentialExists(relPath: string): Promise<boolean> {
  try {
    await access(homeFile(relPath));
    return true;
  } catch {
    return false;
  }
}

/** Roda o statusCheck da recipe (ex.: `codex login status`) e casa o okPattern. */
async function statusSaysLoggedIn(recipe: LoginRecipe): Promise<boolean> {
  if (!recipe.statusCheck) return false;
  const probe = await runProbe(recipe.statusCheck.command, recipe.statusCheck.args, 8000);
  if (!probe) return false;
  return recipe.statusCheck.okPattern.test(`${probe.stdout}\n${probe.stderr}`);
}

/**
 * Pré-check SEGURO de "já logado", SEM spawnar o comando de login (que é
 * destrutivo se interrompido — ver AI/NOTES INCIDENTE_codex_login). Usa apenas
 * leitura de arquivo de credencial, env var de API key e o statusCheck read-only.
 */
async function alreadyLoggedIn(recipe: LoginRecipe): Promise<boolean> {
  for (const f of recipe.successFiles ?? []) {
    if (await credentialExists(f)) return true;
  }
  // CLIs que autenticam por env var (ex.: Aider) contam como logadas se a key existir.
  if (recipe.apiKeyEnv && process.env[recipe.apiKeyEnv]) return true;
  return statusSaysLoggedIn(recipe);
}

/**
 * True se a CLI já está autenticada (read-only, seguro). Exposto p/ a UI decidir
 * se mostra o botão de login. Retorna false em erro (fail-safe: melhor oferecer login).
 */
export async function isCliLoggedIn(kind: CliKind): Promise<boolean> {
  try {
    return await alreadyLoggedIn(getSetupRecipe(kind).login);
  } catch {
    return false;
  }
}

/**
 * Sessão de login viva: spawna o processo de login, emite eventos normalizados,
 * detecta sucesso (arquivo de credencial fresco e/ou statusCheck) e permite
 * injetar código/token (device flow) via `submitInput`.
 */
export class LoginSession {
  private child?: ChildProcess;
  private startedAt = 0;
  private done = false;
  private loggedIn = false;
  private buf = '';
  private pollTimer?: NodeJS.Timeout;
  private timeoutTimer?: NodeJS.Timeout;
  private readonly recipe: LoginRecipe;

  constructor(
    readonly kind: CliKind,
    private readonly emit: (e: LoginEvent) => void,
  ) {
    this.recipe = getSetupRecipe(kind).login;
  }

  /**
   * Inicia o login. Se `apiKey` for fornecida e a CLI aceitar env var, tenta o
   * caminho não-interativo primeiro (sem OAuth). `interactiveHeadless` força o
   * modo que imprime a URL no stdout (Cursor NO_OPEN_BROWSER=1).
   */
  async start(opts: { apiKey?: string; interactiveHeadless?: boolean } = {}): Promise<void> {
    this.startedAt = Date.now();

    // Caminho A: API key/env var (sem browser) — mais confiável quando disponível.
    if (opts.apiKey && this.recipe.apiKeyEnv) {
      this.emit({ type: 'progress', line: `Validando ${this.recipe.apiKeyEnv}...` });
      const ok = await this.tryApiKey(opts.apiKey);
      if (ok) {
        this.loggedIn = true;
        this.emit({ type: 'logged-in' });
        this.emit({ type: 'done' });
        return;
      }
      this.emit({ type: 'progress', line: 'API key não confirmou login; tentando fluxo interativo.' });
    }

    // Pré-check SEGURO: se já há credencial/status de login, NÃO spawnar o login
    // interativo (que é destrutivo se interrompido — ver AI/NOTES INCIDENTE_codex_login).
    if (await alreadyLoggedIn(this.recipe)) {
      this.emit({ type: 'progress', line: 'Já autenticado — nada a fazer.' });
      this.finish(true);
      return;
    }

    // Método api-key-env (ex.: Aider) NÃO tem fluxo interativo de login — a única
    // forma é a env var. Sem key fornecida, orientar em vez de spawnar um TUI que trava.
    if (this.recipe.method === 'api-key-env') {
      this.emit({
        type: 'awaiting-input',
        prompt: `Esta CLI autentica só por API key. Cole a chave (${this.recipe.apiKeyEnv}) para concluir.`,
        secret: true,
      });
      this.finish(false);
      return;
    }

    // Caminho B: fluxo interativo (OAuth/CLI). command undefined => roda o próprio binário.
    const command = this.recipe.command ?? this.kind;
    const args = this.recipe.args ?? [];
    const env: Record<string, string> = {};
    // Cursor: NO_OPEN_BROWSER=1 imprime a URL no stdout (útil em headless).
    if (opts.interactiveHeadless && this.kind === 'cursor') env.NO_OPEN_BROWSER = '1';

    try {
      this.child = await spawnCli(command, args, { stdin: 'pipe', env });
    } catch (err) {
      this.fail(`Falha ao iniciar login: ${(err as Error).message}`);
      return;
    }

    const onData = (chunk: Buffer) => this.onData(chunk);
    this.child.stdout?.on('data', onData);
    this.child.stderr?.on('data', onData);
    this.child.on('close', () => this.onClose());
    this.child.on('error', (e) => this.fail(e.message));

    // Polling de credencial (para OAuth que grava arquivo sem imprimir sucesso claro).
    this.pollTimer = setInterval(() => void this.checkSuccess(), CRED_POLL_MS);
    this.timeoutTimer = setTimeout(() => this.fail('Tempo de login esgotado.'), LOGIN_TIMEOUT_MS);
  }

  /** Injeta um código/token no stdin do processo de login (device flow / prompt). */
  submitInput(value: string): void {
    if (this.child?.stdin && !this.done) {
      this.child.stdin.write(value.endsWith('\n') ? value : `${value}\n`);
    }
  }

  /** Cancela o login em andamento (interrupção SUAVE — ver gentlyStop). */
  cancel(): void {
    this.gentlyStop();
    this.finish(false);
  }

  /**
   * Encerra o processo de login SEM corromper credencial. Matar `codex login`
   * (SIGKILL) no meio APAGA o auth.json (AI/NOTES INCIDENTE_codex_login).
   * SIGINT deixa a CLI abortar limpo; killTree só como último recurso, tardio.
   */
  private gentlyStop(): void {
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    try {
      child.kill('SIGINT');
    } catch {
      /* ignore */
    }
    // Fallback duro só se não sair em 3s (evita processo pendurado eternamente).
    setTimeout(() => {
      if (child.exitCode === null && !child.killed) killTree(child);
    }, 3000).unref?.();
  }

  isDone(): boolean {
    return this.done;
  }

  // ---- internos ----

  private onData(chunk: Buffer): void {
    this.buf += chunk.toString('utf8');
    const parts = this.buf.split(/\r?\n/);
    this.buf = parts.pop() ?? '';
    for (const line of parts) {
      if (!line.trim()) continue;
      this.emit({ type: 'progress', line });
      const events = this.recipe.parseLine?.(line) ?? [];
      for (const e of events) {
        if (e.type === 'logged-in') this.loggedIn = true;
        this.emit(e);
      }
      if (this.recipe.successPattern?.test(line)) this.loggedIn = true;
    }
    if (this.loggedIn) void this.checkSuccess();
  }

  private async checkSuccess(): Promise<void> {
    if (this.done) return;
    let ok = this.loggedIn;
    if (!ok && this.recipe.successFiles) {
      for (const f of this.recipe.successFiles) {
        if (await credentialFresh(f, this.startedAt)) {
          ok = true;
          break;
        }
      }
    }
    if (!ok) ok = await statusSaysLoggedIn(this.recipe);
    if (ok) this.finish(true);
  }

  private async tryApiKey(apiKey: string): Promise<boolean> {
    // Codex tem fluxo dedicado: `codex login --with-api-key` (key via stdin).
    if (this.kind === 'codex') {
      try {
        const child = await spawnCli('codex', ['login', '--with-api-key'], { stdin: 'pipe' });
        child.stdin?.write(`${apiKey}\n`);
        child.stdin?.end();
        const code: number = await new Promise((res) => child.on('close', (c) => res(c ?? 1)));
        if (code === 0) return true;
      } catch {
        /* cai para validação por env abaixo */
      }
    }
    // Demais: persistir a key na env do processo (o spawn real das CLIs a repassa
    // via cliEnvAllowlist → buildCliEnv). Antes disso `buildCliEnv({...})` era
    // descartado (dead code) e a key nunca valia.
    if (this.recipe.apiKeyEnv) {
      process.env[this.recipe.apiKeyEnv] = apiKey;
      // Se há statusCheck, confirma com ele; senão, ter a key não-vazia já basta
      // (métodos api-key-env/paste-token não têm OAuth — a key É a autenticação).
      if (this.recipe.statusCheck) return statusSaysLoggedIn(this.recipe);
      return apiKey.trim().length > 0;
    }
    return false;
  }

  private onClose(): void {
    // Processo saiu: confirma sucesso uma última vez (pode ter gravado credencial no fim).
    void this.checkSuccess().then(() => {
      if (!this.done) this.finish(this.loggedIn);
    });
  }

  private fail(message: string): void {
    if (this.done) return;
    this.emit({ type: 'error', message });
    this.finish(false);
  }

  private finish(success: boolean): void {
    if (this.done) return;
    this.done = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    // Encerramento suave (nunca SIGKILL abrupto — corrompe credencial).
    this.gentlyStop();
    if (success && !this.loggedIn) {
      this.loggedIn = true;
      this.emit({ type: 'logged-in' });
    }
    this.emit({ type: 'done' });
  }
}
