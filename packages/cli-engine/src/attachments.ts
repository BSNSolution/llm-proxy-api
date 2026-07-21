import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Attachment } from '@llm-proxy/shared-types';
import { attachmentsTmpDir } from './platform/index.js';

/** Extensão a partir do mime (fallback .bin). */
function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/mp4': '.m4a',
    'audio/webm': '.webm',
  };
  return map[mime.toLowerCase()] ?? '.bin';
}

/** Extrai (mime, base64) de uma data URL `data:<mime>;base64,<data>`. */
export function parseDataUrl(url: string): { mime: string; base64: string } | null {
  const m = url.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return null;
  return { mime: m[1]!, base64: m[2]! };
}

export interface MaterializedAttachment {
  path: string;
  kind: Attachment['kind'];
  mime: string;
}

/**
 * Materializa anexos (base64 ou path já existente) em arquivos temporários,
 * para serem referenciados via `@path` no prompt da CLI. Retorna os paths +
 * uma função de limpeza a chamar ao fim do turno.
 */
export function materializeAttachments(attachments: Attachment[]): {
  files: MaterializedAttachment[];
  cleanup: () => void;
} {
  const dir = join(attachmentsTmpDir(), randomBytes(8).toString('hex'));
  mkdirSync(dir, { recursive: true });
  const files: MaterializedAttachment[] = [];
  const created: string[] = [];

  for (const att of attachments) {
    // se já veio um path na máquina, usa direto (não copia)
    if (att.path) {
      files.push({ path: att.path, kind: att.kind, mime: att.mime });
      continue;
    }
    if (!att.dataBase64) continue;
    const ext = extFromMime(att.mime);
    const safeName = att.name.replace(/[^\w.-]/g, '_') || `file${ext}`;
    const filePath = join(dir, safeName.endsWith(ext) ? safeName : `${safeName}${ext}`);
    writeFileSync(filePath, Buffer.from(att.dataBase64, 'base64'));
    created.push(filePath);
    files.push({ path: filePath, kind: att.kind, mime: att.mime });
  }

  return {
    files,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      void created;
    },
  };
}

/** Constrói o sufixo de prompt referenciando os anexos via @path. */
export function attachmentPromptSuffix(files: MaterializedAttachment[]): string {
  if (!files.length) return '';
  const refs = files.map((f) => `@${f.path}`).join(' ');
  return `\n\nArquivos anexados: ${refs}`;
}
