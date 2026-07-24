import { prisma, type ProxyKey } from '@llm-proxy/db';
import type { SourceRef } from '@llm-proxy/cli-engine';
import type { FunctionCapability } from '@llm-proxy/shared-types';
import { detectCapability } from './detect-capability.js';
import { getAvailability, expandItem, expandCombo, type ResolvedTarget } from './resolve-target.js';

/**
 * Resolve um destino via ROUTER (workflow de capacidades). Aciona quando:
 *  - model === "router"            → router default do dono
 *  - model === "router:<slug>"     → router nomeado
 *  - model === "cap:<capability>"  → força a capacidade (usa o router default p/ mapear)
 *
 * Detecta a capacidade do request (ou usa o override cap:) e despacha para a
 * regra correspondente (fonte direta ou combo, com fallback). Se nada casar,
 * retorna null → o proxy segue com resolveTarget normal.
 */
export async function resolveRouterTarget(
  key: ProxyKey,
  model: string,
  body: unknown,
): Promise<ResolvedTarget | null> {
  const isRouter = model === 'router' || model.startsWith('router:');
  const isCapOverride = model.startsWith('cap:');
  if (!isRouter && !isCapOverride) return null;

  // Capacidade: override explícito (cap:) vence; senão detecta pelo request.
  let capability: FunctionCapability | null = null;
  if (isCapOverride) {
    capability = model.slice('cap:'.length) as FunctionCapability;
  } else {
    capability = detectCapability(body);
  }
  if (!capability) return null;

  // Qual router usar.
  const slug = model.startsWith('router:') ? model.slice('router:'.length) : null;
  const router = slug
    ? await prisma.router.findUnique({ where: { ownerId_slug: { ownerId: key.ownerId, slug } }, include: { rules: true } })
    : await prisma.router.findFirst({
        where: { ownerId: key.ownerId, isDefault: true, enabled: true },
        include: { rules: true },
      });
  if (!router || !router.enabled) return null;

  const rule = router.rules.find((r) => r.capability === capability);
  if (!rule) return null;

  const avail = await getAvailability();
  const label = `router:${router.slug}→${capability}`;

  // Regra aponta p/ um combo (fallback próprio) OU uma fonte direta.
  if (rule.comboId) {
    const combo = await prisma.combo.findUnique({ where: { id: rule.comboId } });
    if (combo) {
      const refs = await expandCombo(key.ownerId, combo.slug, avail);
      return { refs, label };
    }
  }
  const ref: SourceRef | null = expandItem(
    { source: rule.source ?? 'cli', cliKind: rule.cliKind, provider: rule.provider, model: rule.model },
    avail,
  );
  return { refs: ref ? [ref] : [], label };
}
