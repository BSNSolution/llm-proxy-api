import type { CliKind, DetectedCli } from '@llm-proxy/shared-types';
import { resolveBinary, runProbe } from './platform/index.js';
import { ALL_CLI_METAS, CLI_REGISTRY, type CliMeta } from './registry.js';

/** Extrai um número de versão (x.y.z) de um output arbitrário de `--version`. */
function parseVersion(output: string): string | undefined {
  const m = output.match(/\d+\.\d+\.\d+(?:[-.][\w.]+)?/);
  return m?.[0];
}

/** Resolve o binário da CLI tentando o nome principal e depois os aliases. */
async function resolveMetaBinary(meta: CliMeta): Promise<{ name: string; path: string } | null> {
  for (const name of [meta.binary, ...(meta.binaryAliases ?? [])]) {
    const path = await resolveBinary(name);
    if (path) return { name, path };
  }
  return null;
}

/** Detecta UMA CLI: resolve binário no PATH e tenta ler a versão. */
export async function detectCli(meta: CliMeta): Promise<DetectedCli> {
  const now = new Date().toISOString();
  const resolved = await resolveMetaBinary(meta);
  if (!resolved) {
    return {
      kind: meta.kind,
      present: false,
      capabilities: meta.capabilities,
      defaultModel: meta.defaultModel,
      models: meta.models,
      lastProbedAt: now,
    };
  }
  const { name: binaryName, path: binaryPath } = resolved;
  // versão é best-effort — algumas CLIs podem demorar/variar formato
  const probe = await runProbe(binaryName, meta.versionArgs, 5000);
  const version = probe ? parseVersion(`${probe.stdout} ${probe.stderr}`) : undefined;
  return {
    kind: meta.kind,
    present: true,
    binaryPath,
    version,
    capabilities: meta.capabilities,
    defaultModel: meta.defaultModel,
    models: meta.models,
    lastProbedAt: now,
  };
}

/** Detecta TODAS as CLIs conhecidas, em paralelo. */
export async function detectAllClis(): Promise<DetectedCli[]> {
  return Promise.all(ALL_CLI_METAS.map((meta) => detectCli(meta)));
}

/** Detecta apenas as CLIs presentes. */
export async function detectPresentClis(): Promise<DetectedCli[]> {
  const all = await detectAllClis();
  return all.filter((c) => c.present);
}

/** Detecta uma CLI por kind. */
export function detectByKind(kind: CliKind): Promise<DetectedCli> {
  return detectCli(CLI_REGISTRY[kind]);
}
