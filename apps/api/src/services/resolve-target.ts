import { prisma, type ProxyKey } from '@llm-proxy/db';
import { CLI_TO_HTTP_PROVIDER, type SourceRef, type HttpProviderKind } from '@llm-proxy/cli-engine';
import { getHttpKeys } from './http-providers.js';

/**
 * A partir do modelo resolvido, decide a LISTA ORDENADA de fontes a executar.
 * - "combo:<slug>" → itens do combo (fallback na ordem)
 * - modelo normal   → uma única fonte (a CLI da key), com espelho HTTP se a CLI
 *                     não estiver disponível nesta instância (modo híbrido).
 *
 * O Router (cap:/router:) é resolvido antes, em resolve-router.ts, que também
 * termina chamando expandTarget para um combo ou uma fonte.
 */
export interface ResolvedTarget {
  refs: SourceRef[];
  /** label do que foi escolhido (p/ o campo model da resposta e logs) */
  label: string;
}

/** Fontes disponíveis nesta instância: CLIs presentes+habilitadas + providers HTTP com key. */
export async function getAvailability(): Promise<{ clis: Set<string>; http: Set<HttpProviderKind> }> {
  const [detected, configs, httpKeys] = await Promise.all([
    prisma.detectedCli.findMany({ where: { present: true }, select: { kind: true } }),
    prisma.cliConfig.findMany({ where: { enabled: true }, select: { kind: true } }),
    getHttpKeys(),
  ]);
  const present = new Set(detected.map((d) => d.kind));
  const clis = new Set([...configs.map((c) => c.kind)].filter((k) => present.has(k)));
  const http = new Set(Object.keys(httpKeys) as HttpProviderKind[]);
  return { clis, http };
}

/**
 * Expande UM item (source+cli/provider+model) para um SourceRef, aplicando o
 * modo híbrido: se pediram CLI mas ela não está disponível e há provider HTTP
 * equivalente configurado, usa o HTTP (mesma capacidade, ambiente diferente).
 */
export function expandItem(
  item: { source: 'cli' | 'http'; cliKind?: string | null; provider?: string | null; model?: string | null },
  avail: { clis: Set<string>; http: Set<HttpProviderKind> },
): SourceRef | null {
  if (item.source === 'http') {
    const provider = item.provider as HttpProviderKind | undefined;
    if (provider && avail.http.has(provider)) return { kind: 'http', provider, model: item.model ?? 'default' };
    return null;
  }
  // source = cli
  const cli = item.cliKind as string | undefined;
  if (!cli) return null;
  if (avail.clis.has(cli)) return { kind: 'cli', cliKind: cli as never, model: item.model ?? undefined };
  // CLI indisponível → tenta espelho HTTP (modo híbrido)
  const mirror = CLI_TO_HTTP_PROVIDER[cli as never];
  if (mirror && avail.http.has(mirror)) return { kind: 'http', provider: mirror, model: item.model ?? 'default' };
  return null;
}

/** Resolve um "combo:<slug>" para a lista de refs (na ordem, itens indisponíveis dropados). */
export async function expandCombo(
  ownerId: string,
  slug: string,
  avail: { clis: Set<string>; http: Set<HttpProviderKind> },
): Promise<SourceRef[]> {
  const combo = await prisma.combo.findUnique({
    where: { ownerId_slug: { ownerId, slug } },
    include: { items: { orderBy: { order: 'asc' } } },
  });
  if (!combo || !combo.enabled) return [];
  const refs: SourceRef[] = [];
  for (const it of combo.items) {
    const ref = expandItem(it, avail);
    if (ref) refs.push(ref);
  }
  return refs;
}

/**
 * Ponto de entrada: dado key + modelo resolvido, produz o alvo (lista de refs).
 * Router (cap:/router:) é tratado por resolveRouterTarget (Fase C) antes disto.
 */
export async function resolveTarget(key: ProxyKey, model: string): Promise<ResolvedTarget> {
  const avail = await getAvailability();

  if (model.startsWith('combo:')) {
    const slug = model.slice('combo:'.length);
    const refs = await expandCombo(key.ownerId, slug, avail);
    return { refs, label: model };
  }

  // Modelo normal: a CLI da key, com espelho híbrido.
  const ref = expandItem({ source: 'cli', cliKind: key.cliKind, model }, avail);
  return { refs: ref ? [ref] : [], label: model };
}
