/**
 * Gera apps/web/src/lib/icons.ts com APENAS os ícones Iconify usados (offline).
 * Evita depender da API pública do Iconify em runtime (app single-machine,
 * pode não ter internet). Rode após adicionar/trocar um ícone de CLI:
 *   node apps/web/scripts/gen-icons.mjs
 * Requer os pacotes @iconify-json/{ri,simple-icons,bxl} instalados.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Ícones usados, por set. Manter em sync com CLI_ICONS (cli-card.tsx). */
const WANT = {
  ri: [
    'anthropic-fill',
    'openai-fill',
    'gemini-fill',
    'robot-2-fill',
    'terminal-box-fill',
    'twitter-x-fill',
    'code-box-fill',
  ],
  'simple-icons': ['cursor', 'opencode', 'githubcopilot', 'qwen', 'sourcegraph'],
  bxl: ['google-antigravity'],
};

const PKG = {
  ri: '@iconify-json/ri/icons.json',
  'simple-icons': '@iconify-json/simple-icons/icons.json',
  bxl: '@iconify-json/bxl/icons.json',
};

function pick(prefix) {
  const set = JSON.parse(readFileSync(require.resolve(PKG[prefix]), 'utf8'));
  const out = { prefix: set.prefix, icons: {}, width: set.width, height: set.height };
  for (const n of WANT[prefix]) {
    if (set.icons[n]) out.icons[n] = set.icons[n];
    else console.error('FALTA', prefix, n);
  }
  return out;
}

const collections = Object.keys(WANT).map(pick);
const out =
  '// GERADO por scripts/gen-icons.mjs — ícones Iconify offline (só os usados).\n' +
  "import { addCollection } from '@iconify/react';\n\n" +
  collections.map((c) => `addCollection(${JSON.stringify(c)});`).join('\n') +
  '\n';

writeFileSync(new URL('../src/lib/icons.ts', import.meta.url), out);
console.log('✓ apps/web/src/lib/icons.ts gerado');
