// Filtros de compressão de tool_result — reduzem tokens de saídas verbosas de
// ferramentas (git diff, grep, ls, tree, logs) ANTES de irem ao LLM, sem perder
// o essencial. Implementação própria (TS), inspirada na ideia do RTK (Apache-2.0,
// github.com/rtk-ai/rtk). Cada filtro é texto→texto puro e determinístico.

export type Filter = (text: string) => string;

/** git diff: mantém headers de arquivo + hunks, comprime blocos de contexto grandes. */
export function gitDiff(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let ctxRun = 0;
  const flushCtx = (): void => {
    if (ctxRun > 3) out.push(`  … (${ctxRun} linhas de contexto inalteradas)`);
    ctxRun = 0;
  };
  for (const line of lines) {
    const c = line[0];
    if (line.startsWith('diff --git') || line.startsWith('@@') || line.startsWith('+++') || line.startsWith('---') || line.startsWith('index ')) {
      flushCtx();
      out.push(line);
    } else if (c === '+' || c === '-') {
      flushCtx();
      out.push(line);
    } else {
      // linha de contexto: mantém as 1as, colapsa runs longos
      if (ctxRun < 3) out.push(line);
      ctxRun++;
    }
  }
  flushCtx();
  return out.join('\n');
}

/** git status: remove verbosidade (dicas do git), mantém a lista de arquivos. */
export function gitStatus(text: string): string {
  return text
    .split('\n')
    .filter((l) => !/^\s*\(use "git/.test(l) && l.trim() !== '')
    .join('\n');
}

/** grep: agrupa múltiplos hits do mesmo arquivo sob um cabeçalho. */
export function grep(text: string): string {
  const byFile = new Map<string, string[]>();
  const other: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^([^:]+):(\d+):(.*)$/);
    if (m) {
      const arr = byFile.get(m[1]!) ?? [];
      arr.push(`  ${m[2]}: ${m[3]!.trim()}`);
      byFile.set(m[1]!, arr);
    } else if (line.trim()) {
      other.push(line);
    }
  }
  const out: string[] = [];
  for (const [file, hits] of byFile) out.push(`${file} (${hits.length})`, ...hits);
  out.push(...other);
  return out.join('\n');
}

/** ls -la: mantém nome + tipo, descarta perms/owner/size/data verbosos. */
export function ls(text: string): string {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (/^total \d+$/.test(line)) continue;
    const m = line.match(/^([-dl])[rwx-]{9}[\s\d\w:.-]+\s(\S.*)$/);
    if (m) {
      const kind = m[1] === 'd' ? '/' : m[1] === 'l' ? '@' : '';
      out.push(`${m[2]}${kind}`);
    } else if (line.trim()) {
      out.push(line);
    }
  }
  return out.join('\n');
}

/** tree: colapsa diretórios muito grandes mantendo a estrutura de topo. */
export function tree(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= 60) return text;
  // mantém topo + resumo do que foi cortado
  const head = lines.slice(0, 55);
  const cut = lines.length - 55;
  return [...head, `… (+${cut} linhas de árvore omitidas)`].join('\n');
}

/** dedup-log: colapsa linhas idênticas consecutivas (logs repetitivos). */
export function dedupLog(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let prev: string | null = null;
  let count = 0;
  const flush = (): void => {
    if (prev !== null) {
      out.push(count > 1 ? `${prev}  ×${count}` : prev);
    }
  };
  for (const line of lines) {
    if (line === prev) {
      count++;
    } else {
      flush();
      prev = line;
      count = 1;
    }
  }
  flush();
  return out.join('\n');
}

/** smart-truncate: para blobs enormes sem estrutura, mantém início + fim. */
export function smartTruncate(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= 120) return text;
  const head = lines.slice(0, 60);
  const tail = lines.slice(-40);
  const cut = lines.length - 100;
  return [...head, `… (${cut} linhas omitidas do meio) …`, ...tail].join('\n');
}
