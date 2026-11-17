import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { buildCliEnv } from './platform/index.js';

// Onde o Codex REALMENTE salva as imagens da built-in image_gen: $CODEX_HOME/generated_images/<sessão>/exec-*.png
// (ele IGNORA o -C/cwd para a saída da tool). Precisamos varrer aqui, não só o workdir. Bug real: antes só
// olhávamos o workdir (que fica vazio) → pegava imagem antiga OU falhava. Ver AI/NOTES 07/08 (bsn-social).
function codexImagesDir(): string {
  const home = process.env.CODEX_HOME || join(homedir(), '.codex');
  return join(home, 'generated_images');
}

// Acha o PNG/webp/jpg mais recente numa árvore (recursivo), criado/modificado em/depois de `sinceMs`.
// `sinceMs` garante que só aceitamos a imagem DESTA geração — nunca reaproveita arquivo antigo.
interface Candidate {
  path: string;
  mtime: number;
}
function newestImageSince(dir: string, sinceMs: number): string | null {
  if (!existsSync(dir)) return null;
  // coleta todos os candidatos (recursivo, até profundidade 3) e escolhe o mais recente no fim.
  const found: Candidate[] = [];
  const walk = (d: string, depth: number): void => {
    if (depth > 3) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      const p = join(d, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(p, depth + 1);
        continue;
      }
      if (!/\.(png|webp|jpe?g)$/i.test(name)) continue;
      // tolerância de 2s p/ clock skew, mas ainda ancorado no início desta geração.
      if (st.mtimeMs < sinceMs - 2000) continue;
      found.push({ path: p, mtime: st.mtimeMs });
    }
  };
  walk(dir, 0);
  if (found.length === 0) return null;
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0]!.path;
}

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

  // marca o instante ANTES de rodar o codex: só aceitamos imagem criada a partir daqui (nunca reaproveita antiga).
  const startMs = Date.now();

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

  // Pega a imagem gerada NESTA execução. O Codex pode salvar (a) no workdir isolado (quando respeita o -C)
  // OU (b) em $CODEX_HOME/generated_images/<sessão>/exec-*.png (o padrão real da built-in image_gen). Buscamos
  // nos dois, sempre filtrando por mtime >= início desta geração → nunca reaproveita arquivo antigo (bug).
  const fromWorkdir = newestImageSince(workdir, startMs);
  const fromCodexHome = fromWorkdir ? null : newestImageSince(codexImagesDir(), startMs);
  const generated = fromWorkdir ?? fromCodexHome;
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

