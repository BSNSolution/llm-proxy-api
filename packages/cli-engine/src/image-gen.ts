import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { buildCliEnv } from './platform/index.js';

export interface ImageGenOptions {
  /** WxH (múltiplos de 16, entre 3:1 e 1:3). Default 1024x1024. */
  size?: string;
  /** caminho de saída absoluto do PNG final */
  outPath: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ImageGenResult {
  ok: boolean;
  path?: string;
  error?: string;
}

/**
 * Gera uma imagem usando a tool nativa do Codex (`image_gen` / gpt-image-2),
 * consumindo a assinatura ChatGPT do login do `codex`. NÃO usa API key.
 *
 * Receita validada (ver AI/NOTES 17/07/2026): é obrigatório instruir EXPLICITAMENTE
 * o Codex a usar a built-in image_gen, senão ele responde texto (ou escreve script
 * de API). Rodamos em workspace-write num cwd temporário e capturamos o PNG.
 */
export async function generateImageWithCodex(
  prompt: string,
  opts: ImageGenOptions,
): Promise<ImageGenResult> {
  const size = opts.size ?? '1024x1024';
  const outPath = opts.outPath;

  // Workdir ÚNICO e VAZIO por geração: o Codex salva o PNG aqui (com o nome que
  // escolher). Assim pegamos "o PNG deste turno" sem risco de fallback pegar uma
  // imagem antiga de outra geração (bug corrigido 17/07/2026).
  const workdir = join(tmpdir(), 'llm-proxy-imggen', randomBytes(8).toString('hex'));
  mkdirSync(workdir, { recursive: true });
  try {
    mkdirSync(join(outPath, '..'), { recursive: true });
  } catch {
    /* ignore */
  }

  const instr =
    `Use the built-in image_gen tool directly (gpt-image-2 model, NOT a CLI/API script). ` +
    `Generate an image of size ${size} for this prompt: ${prompt}. ` +
    `Save the final PNG in the current working directory (${workdir}). ` +
    `Then print a single line with its absolute path prefixed by SAVED:`;

  const args = ['exec', '-C', workdir, '-s', 'workspace-write', '--skip-git-repo-check', instr];

  const codeExit = await new Promise<number>((resolve) => {
    const child = spawn('codex', args, {
      cwd: workdir,
      env: buildCliEnv(),
      shell: false,
      windowsHide: true,
      signal: opts.signal,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 300_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(1);
    });
  });

  // Pega o PNG gerado NESTE workdir (isolado) e move para o outPath final.
  const generated = newestImage(workdir);
  try {
    if (generated) {
      copyFileSync(generated, outPath);
      rmSync(workdir, { recursive: true, force: true });
      return { ok: true, path: outPath };
    }
  } catch {
    /* ignore */
  }
  rmSync(workdir, { recursive: true, force: true });

  return {
    ok: false,
    error:
      codeExit !== 0
        ? `codex saiu com código ${codeExit} sem gerar imagem (login ChatGPT? cota do plano?)`
        : 'imagem não encontrada — o prompt pode não ter acionado image_gen.',
  };
}

/** Acha o arquivo de imagem mais recente num diretório. */
function newestImage(dir: string): string | null {
  if (!existsSync(dir)) return null;
  let best: { path: string; mtime: number } | null = null;
  for (const name of readdirSync(dir)) {
    if (!/\.(png|webp|jpe?g)$/i.test(name)) continue;
    const p = join(dir, name);
    try {
      const m = statSync(p).mtimeMs;
      if (!best || m > best.mtime) best = { path: p, mtime: m };
    } catch {
      /* ignore */
    }
  }
  return best?.path ?? null;
}
