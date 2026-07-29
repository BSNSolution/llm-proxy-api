import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@llm-proxy/db';
import { CLI_KINDS } from '@llm-proxy/shared-types';
import { writeAudit } from '../services/audit.js';
import { resolveOwnerId } from '../services/owner.js';

// Um item do combo: fonte CLI (cliKind) ou HTTP (provider) + model opcional.
const ComboItemInput = z
  .object({
    source: z.enum(['cli', 'http']).default('cli'),
    cliKind: z.enum(CLI_KINDS).optional(),
    provider: z.enum(['anthropic', 'openai', 'gemini']).optional(),
    model: z.string().nullable().optional(),
  })
  .refine((i) => (i.source === 'cli' ? !!i.cliKind : !!i.provider), {
    message: 'item cli exige cliKind; item http exige provider',
  });

const CreateCombo = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug: minúsculas, números e hífen'),
  name: z.string().min(1),
  strategy: z.enum(['priority', 'round-robin']).default('priority'),
  items: z.array(ComboItemInput).min(1),
});

const UpdateCombo = z.object({
  name: z.string().min(1).optional(),
  strategy: z.enum(['priority', 'round-robin']).optional(),
  enabled: z.boolean().optional(),
  items: z.array(ComboItemInput).min(1).optional(),
});

export function registerComboRoutes(app: FastifyInstance): void {
  // Lista os combos do usuário.
  app.get('/api/combos', async (req, reply) => {
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const combos = await prisma.combo.findMany({
      where: { ownerId },
      include: { items: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ combos });
  });

  // Cria um combo com itens ordenados.
  app.post('/api/combos', async (req, reply) => {
    const parsed = CreateCombo.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Inválido.' });
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const { slug, name, strategy, items } = parsed.data;

    const dup = await prisma.combo.findUnique({ where: { ownerId_slug: { ownerId, slug } } });
    if (dup) return reply.status(409).send({ error: `Já existe um combo "${slug}".` });

    const combo = await prisma.combo.create({
      data: {
        ownerId,
        slug,
        name,
        strategy,
        items: {
          create: items.map((it, order) => ({
            order,
            source: it.source,
            cliKind: it.source === 'cli' ? it.cliKind : null,
            provider: it.source === 'http' ? it.provider : null,
            model: it.model ?? null,
          })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    await writeAudit(req.authUser?.id, 'combo.create', combo.slug);
    return reply.status(201).send({ combo });
  });

  // Atualiza (inclui substituição total dos itens quando enviados).
  app.patch('/api/combos/:id', async (req, reply) => {
    const parsed = UpdateCombo.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Inválido.' });
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const { id } = req.params as { id: string };
    const existing = await prisma.combo.findFirst({ where: { id, ownerId } });
    if (!existing) return reply.status(404).send({ error: 'Combo não encontrado.' });

    const { items, ...rest } = parsed.data;
    const combo = await prisma.$transaction(async (tx) => {
      await tx.combo.update({ where: { id }, data: rest });
      if (items) {
        await tx.comboItem.deleteMany({ where: { comboId: id } });
        await tx.comboItem.createMany({
          data: items.map((it, order) => ({
            comboId: id,
            order,
            source: it.source,
            cliKind: it.source === 'cli' ? it.cliKind! : null,
            provider: it.source === 'http' ? it.provider! : null,
            model: it.model ?? null,
          })),
        });
      }
      return tx.combo.findUnique({ where: { id }, include: { items: { orderBy: { order: 'asc' } } } });
    });
    await writeAudit(req.authUser?.id, 'combo.update', existing.slug);
    return reply.send({ combo });
  });

  app.delete('/api/combos/:id', async (req, reply) => {
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const { id } = req.params as { id: string };
    const existing = await prisma.combo.findFirst({ where: { id, ownerId } });
    if (!existing) return reply.status(404).send({ error: 'Combo não encontrado.' });
    await prisma.combo.delete({ where: { id } });
    await writeAudit(req.authUser?.id, 'combo.delete', existing.slug);
    return reply.send({ ok: true });
  });
}
