import { prisma, type ProxyKey } from '@llm-proxy/db';
import type { SourceRef } from '@llm-proxy/cli-engine';
import { FUNCTION_CAPABILITIES, type FunctionCapability } from '@llm-proxy/shared-types';
import { detectCapability } from './detect-capability.js';
import { getAvailability, expandItem, expandCombo, type ResolvedTarget } from './resolve-target.js';

function isValidCapability(v: string): v is FunctionCapability {
  return (FUNCTION_CAPABILITIES as readonly string[]).includes(v);
}

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
  // Só retorna null quando NÃO é sintaxe de router/cap (aí o caller usa
  // resolveTarget normal). Quando É sintaxe de router mas não resolve, devolve um
  // target VAZIO (refs:[]) com label explicativo — o runner emite "nenhuma fonte"
  // em vez de o proxy tratar "cap:xxx" como nome de modelo literal.
  if (!isRouter && !isCapOverride) return null;
  const empty = (label: string): ResolvedTarget => ({ refs: [], label });

  // Capacidade: override explícito (cap:) vence; senão detecta pelo request.
  let capability: FunctionCapability | null = null;
  if (isCapOverride) {
    const raw = model.slice('cap:'.length);
    if (!isValidCapability(raw)) return empty(`cap:${raw} (capacidade inválida)`);
    capability = raw;
  } else {
    capability = detectCapability(body);
  }
  if (!capability) return empty('router (capacidade não detectada)');

  // Qual router usar.
  const slug = model.startsWith('router:') ? model.slice('router:'.length) : null;
  const router = slug
    ? await prisma.router.findUnique({ where: { ownerId_slug: { ownerId: key.ownerId, slug } }, include: { rules: true } })
    : await prisma.router.findFirst({
        where: { ownerId: key.ownerId, isDefault: true, enabled: true },
        include: { rules: true },
      });
  if (!router || !router.enabled) {
    return empty(slug ? `router:${slug} (não encontrado)` : 'router (nenhum router padrão configurado)');
  }

  const rule = router.rules.find((r) => r.capability === capability);
  if (!rule) return empty(`router:${router.slug}→${capability} (sem regra p/ esta capacidade)`);

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
