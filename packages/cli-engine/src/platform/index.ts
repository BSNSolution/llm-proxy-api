import { execFile, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir, platform, tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { loadConfig } from '@llm-proxy/config';

const pExecFile = promisify(execFile);

export type OsKind = 'mac' | 'windows' | 'linux' | 'unknown';

export function currentOs(): OsKind {
  switch (platform()) {
    case 'darwin':
      return 'mac';
    case 'win32':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      return 'unknown';
  }
}

export const isWindows = (): boolean => platform() === 'win32';

/** Cache de resolução de binário (nome → caminho absoluto) por processo. */
const binaryPathCache = new Map<string, string | null>();

/**
 * Resolve o caminho de um binário no PATH, cross-platform e SEM executá-lo.
 * Windows: `where` (resolve sufixos do PATHEXT: .cmd/.exe/.bat, um por linha).
 * Unix: `command -v` via /bin/sh (POSIX, não executa o alvo).
 *
 * Retorna o caminho absoluto do primeiro match, ou null se ausente. Cacheado.
 */
export async function resolveBinary(name: string): Promise<string | null> {
  if (binaryPathCache.has(name)) return binaryPathCache.get(name)!;
  let resolved: string | null = null;
  try {
    if (isWindows()) {
      const { stdout } = await pExecFile('where', [name], { timeout: 5000, windowsHide: true });
      resolved =
        stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find(Boolean) ?? null;
    } else {
      const { stdout } = await pExecFile('/bin/sh', ['-c', `command -v ${shellQuote(name)}`], {
        timeout: 5000,
      });
      const p = stdout.trim();
      resolved = p.length > 0 ? p : null;
    }
  } catch {
    resolved = null;
  }
  binaryPathCache.set(name, resolved);
  return resolved;
}

/** Resolve o primeiro nome de binário que existe no PATH (nome primário + aliases). */
export async function resolveFirstBinary(names: string[]): Promise<{ name: string; path: string } | null> {
  for (const name of names) {
    const path = await resolveBinary(name);
    if (path) return { name, path };
  }
  return null;
}

/** Aspas simples seguras p/ um único argumento em sh. */
function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Executa um binário de forma controlada e retorna stdout (para probes de versão).
 * No Windows, `.cmd`/`.bat` não rodam via execFile puro — nesses casos usa
 * `cmd.exe /c`. NÃO usa shell interpretando args do usuário; aplica timeout + env.
 */
export async function runProbe(
  binary: string,
  args: string[],
  timeoutMs = 5000,
): Promise<{ stdout: string; stderr: string } | null> {
  try {
    const resolved = (await resolveBinary(binary)) ?? binary;
    const { command, finalArgs } = windowsSafeInvocation(resolved, args);
    const { stdout, stderr } = await pExecFile(command, finalArgs, {
      timeout: timeoutMs,
      windowsHide: true,
      env: buildCliEnv(),
    });
    return { stdout, stderr };
  } catch {
    return null;
  }
}

/**
 * No Windows, `.cmd`/`.bat` só executam via `cmd.exe /c` (spawn direto lança
 * EINVAL desde Node 20.12/18.20 por segurança). `.exe` roda direto.
 * Em Unix, roda direto sempre.
 */
function windowsSafeInvocation(
  resolvedPath: string,
  args: string[],
): { command: string; finalArgs: string[]; windowsVerbatim: boolean } {
  if (isWindows()) {
    const ext = extname(resolvedPath).toLowerCase();
    if (ext === '.cmd' || ext === '.bat') {
      // cmd.exe /c <script> <args...> — /c evita shell interpretando os args como comando.
      return {
        command: process.env.ComSpec ?? 'cmd.exe',
        finalArgs: ['/d', '/s', '/c', resolvedPath, ...args],
        windowsVerbatim: true,
      };
    }
    if (ext === '.ps1') {
      return {
        command: 'powershell.exe',
        finalArgs: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolvedPath, ...args],
        windowsVerbatim: false,
      };
    }
  }
  return { command: resolvedPath, finalArgs: args, windowsVerbatim: false };
}

/**
 * Spawn cross-platform de uma LLM CLI. Resolve o binário (nome→caminho), trata
 * `.cmd/.bat/.ps1` no Windows, aplica cwd/env/stdio e retorna o ChildProcess.
 * Use `killTree()` para encerrar (mata a árvore no Windows).
 */
export async function spawnCli(
  binary: string,
  args: string[],
  opts: {
    cwd?: string;
    env?: Record<string, string>;
    signal?: AbortSignal;
    /** 'ignore' (one-shot, default) fecha stdin; 'pipe' p/ sessão persistente. */
    stdin?: 'ignore' | 'pipe';
  } = {},
): Promise<ChildProcess> {
  const resolved = (await resolveBinary(binary)) ?? binary;
  const { command, finalArgs, windowsVerbatim } = windowsSafeInvocation(resolved, args);
  const spawnOpts: SpawnOptions = {
    cwd: opts.cwd,
    env: buildCliEnv(opts.env ?? {}),
    shell: false,
    windowsHide: true,
    signal: opts.signal,
    windowsVerbatimArguments: windowsVerbatim,
    stdio: [opts.stdin ?? 'ignore', 'pipe', 'pipe'],
  };
  return spawn(command, finalArgs, spawnOpts);
}

/**
 * Encerra um processo e sua árvore de filhos, cross-platform.
 * Windows: `taskkill /pid <pid> /T /F` (mata a árvore — SIGKILL não propaga lá).
 * Unix: SIGKILL no processo (grupo, se detached).
 */
export function killTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null || child.killed) return;
  if (isWindows()) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } catch {
      child.kill();
    }
  } else {
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }
}

/** Env vars essenciais por SO (sempre incluídas além da allowlist do usuário). */
function baseEnvKeys(): string[] {
  if (isWindows()) {
    // Sem SYSTEMROOT/ComSpec muitos processos Windows quebram; PATHEXT resolve .cmd.
    return [
      'PATH',
      'Path',
      'PATHEXT',
      'SYSTEMROOT',
      'SystemRoot',
      'SYSTEMDRIVE',
      'ComSpec',
      'TEMP',
      'TMP',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'HOMEDRIVE',
      'HOMEPATH',
      'USERNAME',
      'NUMBER_OF_PROCESSORS',
      'PROCESSOR_ARCHITECTURE',
    ];
  }
  return ['HOME', 'PATH', 'USER', 'SHELL', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'XDG_CONFIG_HOME'];
}

/**
 * Monta o env repassado ao spawn das CLIs, restrito à allowlist (hardening).
 * Não herda `process.env` inteiro — evita vazar segredos ao processo filho.
 * Sempre inclui as vars essenciais do SO (senão o processo filho quebra).
 */
export function buildCliEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const { cliEnvAllowlist } = loadConfig();
  const allow = new Set([...baseEnvKeys(), ...cliEnvAllowlist]);
  const env: NodeJS.ProcessEnv = {};
  for (const key of allow) {
    const val = process.env[key];
    if (val !== undefined) env[key] = val;
  }
  return { ...env, ...extra };
}

/** Diretório temporário p/ materializar anexos (imagens/arquivos) antes do spawn. */
export function attachmentsTmpDir(): string {
  return join(tmpdir(), 'llm-proxy-attachments');
}

/**
 * Diretório de trabalho NEUTRO para spawnar as CLIs, isolado do projeto onde o
 * servidor roda. Evita que o Claude (e afins) herdem CLAUDE.md/hooks/MCP do cwd.
 */
export function neutralWorkdir(kind: string): string {
  return join(tmpdir(), 'llm-proxy-workdir', kind);
}

/**
 * Resolve um caminho relativo ao HOME real do usuário (ex.: '.codex/auth.json').
 * As LLM CLIs instaladas via npm gravam credenciais no HOME (`~/.codex`,
 * `~/.gemini`, `~/.claude.json`), NÃO no configHome de app (Library no Mac).
 * Usado pelo detector de sucesso do login.
 */
export function homeFile(relativePath: string): string {
  return join(homedir(), relativePath);
}

/** Caminhos de config por SO (para localizar configs/credenciais das CLIs). */
export function configHome(): string {
  const home = homedir();
  switch (currentOs()) {
    case 'windows':
      return process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    case 'mac':
      return join(home, 'Library', 'Application Support');
    default:
      return process.env.XDG_CONFIG_HOME ?? join(home, '.config');
  }
}
