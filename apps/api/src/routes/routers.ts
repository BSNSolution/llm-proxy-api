import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@llm-proxy/db';
import { CLI_KINDS, FUNCTION_CAPABILITIES } from '@llm-proxy/shared-types';
import { writeAudit } from '../services/audit.js';
import { detectCapability } from '../services/detect-capability.js';

// Uma regra: capacidade → destino (fonte direta OU combo).
const RuleInput = z
  .object({
    capability: z.enum(FUNCTION_CAPABILITIES),
    source: z.enum(['cli', 'http']).default('cli'),
    cliKind: z.enum(CLI_KINDS).optional(),
    provider: z.enum(['anthropic', 'openai', 'gemini']).optional(),
    model: z.string().nullable().optional(),
    comboId: z.string().nullable().optional(),
  })
  .refine((r) => r.comboId || (r.source === 'cli' ? !!r.cliKind : !!r.provider), {
    message: 'regra exige comboId, ou (cli+cliKind) ou (http+provider)',
  });

const CreateRouter = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug: minúsculas, números e hífen'),
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
  rules: z.array(RuleInput).default([]),
});

const UpdateRouter = z.object({
  name: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional(),
  rules: z.array(RuleInput).optional(),
});

async function resolveOwnerId(reqUserId?: string): Promise<string> {
  if (reqUserId) return reqUserId;
  const admin = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('Nenhum admin cadastrado (rode o seed).');
  return admin.id;
}

/** Só um router pode ser default por dono — desmarca os outros. */
async function ensureSingleDefault(tx: typeof prisma, ownerId: string, keepId: string): Promise<void> {
  await tx.router.updateMany({ where: { ownerId, id: { not: keepId }, isDefault: true }, data: { isDefault: false } });
}

export function registerRouterRoutes(app: FastifyInstance): void {
  app.get('/api/routers', async (req, reply) => {
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const routers = await prisma.router.findMany({
      where: { ownerId },
      include: { rules: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return reply.send({ routers });
  });

  app.post('/api/routers', async (req, reply) => {
    const parsed = CreateRouter.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Inválido.' });
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const { slug, name, isDefault, rules } = parsed.data;

    const dup = await prisma.router.findUnique({ where: { ownerId_slug: { ownerId, slug } } });
    if (dup) return reply.status(409).send({ error: `Já existe um router "${slug}".` });

    const router = await prisma.$transaction(async (tx) => {
      const r = await tx.router.create({
        data: {
          ownerId,
          slug,
          name,
          isDefault,
          rules: {
            create: rules.map((rule) => ({
              capability: rule.capability,
              source: rule.source,
              cliKind: rule.source === 'cli' && !rule.comboId ? rule.cliKind : null,
              provider: rule.source === 'http' && !rule.comboId ? rule.provider : null,
              model: rule.model ?? null,
              comboId: rule.comboId ?? null,
            })),
          },
        },
        include: { rules: true },
      });
      if (isDefault) await ensureSingleDefault(tx as never, ownerId, r.id);
      return r;
    });
    await writeAudit(req.authUser?.id, 'router.create', router.slug);
    return reply.status(201).send({ router });
  });

  app.patch('/api/routers/:id', async (req, reply) => {
    const parsed = UpdateRouter.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Inválido.' });
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const { id } = req.params as { id: string };
    const existing = await prisma.router.findFirst({ where: { id, ownerId } });
    if (!existing) return reply.status(404).send({ error: 'Router não encontrado.' });

    const { rules, ...rest } = parsed.data;
    const router = await prisma.$transaction(async (tx) => {
      await tx.router.update({ where: { id }, data: rest });
      if (rules) {
        await tx.routerRule.deleteMany({ where: { routerId: id } });
        await tx.routerRule.createMany({
          data: rules.map((rule) => ({
            routerId: id,
            capability: rule.capability,
            source: rule.source,
            cliKind: rule.source === 'cli' && !rule.comboId ? (rule.cliKind ?? null) : null,
            provider: rule.source === 'http' && !rule.comboId ? (rule.provider ?? null) : null,
            model: rule.model ?? null,
            comboId: rule.comboId ?? null,
          })),
        });
      }
      if (rest.isDefault) await ensureSingleDefault(tx as never, ownerId, id);
      return tx.router.findUnique({ where: { id }, include: { rules: true } });
    });
    await writeAudit(req.authUser?.id, 'router.update', existing.slug);
    return reply.send({ router });
  });

  app.delete('/api/routers/:id', async (req, reply) => {
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const { id } = req.params as { id: string };
    const existing = await prisma.router.findFirst({ where: { id, ownerId } });
    if (!existing) return reply.status(404).send({ error: 'Router não encontrado.' });
    await prisma.router.delete({ where: { id } });
    await writeAudit(req.authUser?.id, 'router.delete', existing.slug);
    return reply.send({ ok: true });
  });

  // Preview: dado um texto/body de exemplo, mostra qual capacidade seria detectada.
  // Usado pela UI ("teste seu workflow") — não executa nada, só a heurística.
  app.post('/api/routers/detect', async (req, reply) => {
    const body = req.body as { sample?: unknown; text?: string };
    const probe = body?.sample ?? { messages: [{ role: 'user', content: body?.text ?? '' }] };
    const capability = detectCapability(probe);
    return reply.send({ capability });
  });
}
