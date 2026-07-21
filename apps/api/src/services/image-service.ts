import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from '@llm-proxy/crypto';
import { generateImageWithCodex, getAdapter } from '@llm-proxy/cli-engine';
import type { CliKind } from '@llm-proxy/shared-types';
import { CLI_REGISTRY } from '@llm-proxy/cli-engine';

/**
 * Diretório persistente das imagens geradas.
 * - IMAGES_DIR (env): caminho absoluto — usado no Docker para apontar a um VOLUME
 *   montado, de modo que as imagens sobrevivam a rebuilds do container.
 * - fallback: <cwd>/generated-images (dev na máquina). import.meta.url varia entre
 *   tsx (src) e bundle (dist), então ancorar no cwd é mais confiável.
 */
/** Caminho do diretório de imagens (NÃO cria — leitura não deve ter efeito colateral). */
function imagesDir(): string {
  void dirname;
  void fileURLToPath;
  return process.env.IMAGES_DIR?.trim()
    ? process.env.IMAGES_DIR.trim()
    : join(process.cwd(), 'generated-images');
}

/** Garante que o diretório existe (só na hora de GRAVAR uma imagem). */
function ensureImagesDir(): string {
  const dir = imagesDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function imagePath(id: string): string {
  return join(imagesDir(), `${id}.png`);
}

/** Lê uma imagem gerada por id (para servir). Valida o id ANTES de tocar o FS. */
export function readImage(id: string): Buffer | null {
  if (!/^[\w-]+$/.test(id)) return null;
  const p = imagePath(id);
  if (!existsSync(p)) return null;
  return readFileSync(p);
}

/** Se a CLI suporta geração de imagem (capability imagesOut). */
export function supportsImageGen(kind: CliKind): boolean {
  return CLI_REGISTRY[kind]?.capabilities.imagesOut === true;
}

export interface GeneratedImage {
  id: string;
  path: string;
  url: string; // relativo ao proxy: /api/images/<id>.png
}

/**
 * Gera uma imagem com a CLI indicada (hoje só Codex). Salva no dataDir e devolve
 * o id + url servível. `publicBaseUrl` monta a URL absoluta quando fornecida.
 */
export async function generateImage(
  kind: CliKind,
  prompt: string,
  opts: { size?: string; publicBaseUrl?: string } = {},
): Promise<{ ok: true; image: GeneratedImage } | { ok: false; error: string }> {
  if (!supportsImageGen(kind)) {
    return { ok: false, error: `A CLI '${kind}' não gera imagens.` };
  }
  // hoje só o Codex tem a tool image_gen validada
  if (kind !== 'codex') {
    return { ok: false, error: `Geração de imagem via '${kind}' ainda não implementada.` };
  }
  // garante que o adapter existe (sanidade)
  getAdapter(kind);

  const id = randomUUID();
  ensureImagesDir(); // cria o diretório só aqui (na gravação), não na leitura
  const out = imagePath(id);
  const res = await generateImageWithCodex(prompt, { outPath: out, size: opts.size });
  if (!res.ok || !res.path) {
    return { ok: false, error: res.error ?? 'falha ao gerar imagem' };
  }
  const rel = `/api/images/${id}.png`;
  return {
    ok: true,
    image: { id, path: res.path, url: opts.publicBaseUrl ? `${opts.publicBaseUrl}${rel}` : rel },
  };
}
