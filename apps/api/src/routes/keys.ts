import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateProxyKey, hashSecret } from '@llm-proxy/crypto';
import { prisma } from '@llm-proxy/db';
import { CLI_KINDS } from '@llm-proxy/shared-types';
import { loadConfig } from '@llm-proxy/config';
import { usedTokensToday } from '../services/proxy-auth.js';
import { writeAudit } from '../services/audit.js';

/**
 * CRUD das Proxy Keys (sk-llmp-…).
 * NOTA: auth de UI (sessão do admin) entra na Fase 0.4 — por ora o ownerId é
 * resolvido pelo primeiro admin (single-machine, uso interno). TODO: exigir sessão.
 */
const CreateKey = z.object({
  name: z.string().min(1),
  cliKind: z.enum(CLI_KINDS),
  defaultModel: z.string().optional(),
  allowedModels: z.array(z.string()).default([]),
  corsOrigins: z.array(z.string()).default([]),
  rateLimitPerMin: z.number().int().positive().default(20),
  dailyTokenQuota: z.number().int().positive().nullable().default(null),
  maxInputChars: z.number().int().positive().default(24000),
  timeoutMs: z.number().int().positive().default(120000),
  expiresAt: z.string().datetime().nullable().default(null),
});

const UpdateKey = z.object({
  name: z.string().min(1).optional(),
  defaultModel: z.string().nullable().optional(),
  allowedModels: z.array(z.string()).optional(),
  corsOrigins: z.array(z.string()).optional(),
  rateLimitPerMin: z.number().int().positive().optional(),
  dailyTokenQuota: z.number().int().positive().nullable().optional(),
  maxInputChars: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

async function resolveOwnerId(reqUserId?: string): Promise<string> {
  if (reqUserId) return reqUserId;
  const admin = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('Nenhum admin cadastrado (rode o seed).');
  return admin.id;
}

export function registerKeyRoutes(app: FastifyInstance): void {
  // Info pública do proxy (base URLs) — p/ preview fixo na UI.
  app.get('/api/proxy-info', async (_req, reply) => {
    const { publicBaseUrl } = loadConfig();
    return reply.send({
      openaiBaseUrl: `${publicBaseUrl}/v1`,
      anthropicBaseUrl: `${publicBaseUrl}/v1`,
      openaiEndpoint: `${publicBaseUrl}/v1/chat/completions`,
      anthropicEndpoint: `${publicBaseUrl}/v1/messages`,
    });
  });

  // Métricas de uso agregadas (últimos 7 dias) — p/ a tela Proxy.
  app.get('/api/usage', async (_req, reply) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const logs = await prisma.usageLog.findMany({
      where: { ts: { gte: since } },
      orderBy: { ts: 'desc' },
      take: 500,
      include: { proxyKey: { select: { name: true, cliKind: true } } },
    });
    const totalRequests = logs.length;
    const totalTokens = logs.reduce((s, l) => s + l.inputTokens + l.outputTokens, 0);
    const errors = logs.filter((l) => l.status >= 400).length;
    const avgLatencyMs = logs.length
      ? Math.round(logs.reduce((s, l) => s + l.latencyMs, 0) / logs.length)
      : 0;
    const byModel: Record<string, { requests: number; tokens: number }> = {};
    for (const l of logs) {
      const k = l.model;
      byModel[k] ??= { requests: 0, tokens: 0 };
      byModel[k].requests++;
      byModel[k].tokens += l.inputTokens + l.outputTokens;
    }
    // série por dia (YYYY-MM-DD): requests + tokens
    const byDayMap: Record<string, { requests: number; tokens: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      byDayMap[d] = { requests: 0, tokens: 0 };
    }
    for (const l of logs) {
      const d = l.ts.toISOString().slice(0, 10);
      byDayMap[d] ??= { requests: 0, tokens: 0 };
      byDayMap[d].requests++;
      byDayMap[d].tokens += l.inputTokens + l.outputTokens;
    }
    const byDay = Object.entries(byDayMap).map(([day, v]) => ({ day, ...v }));
    return reply.send({
      totalRequests,
      totalTokens,
      errors,
      avgLatencyMs,
      byModel,
      byDay,
      recent: logs.slice(0, 100).map((l) => ({
        ts: l.ts,
        model: l.model,
        keyName: l.proxyKey?.name ?? '—',
        cliKind: l.proxyKey?.cliKind ?? '—',
        tokens: l.inputTokens + l.outputTokens,
        estimated: l.estimated,
        latencyMs: l.latencyMs,
        status: l.status,
      })),
    });
  });

  app.get('/api/keys', async (req, reply) => {
    // Isolamento por dono: cada usuário só vê as próprias keys.
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const keys = await prisma.proxyKey.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
    const enriched = await Promise.all(
      keys.map(async (k) => ({
        ...k,
        keyHash: undefined,
        usedTokensToday: await usedTokensToday(k.id),
      })),
    );
    return reply.send({ keys: enriched });
  });

  app.post('/api/keys', async (req, reply) => {
    const parsed = CreateKey.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    const b = parsed.data;
    // Defesa em profundidade: não criar key para uma CLI que não está instalada
    // (a UI já desabilita, mas o backend valida — key p/ CLI ausente é sempre inútil).
    const detected = await prisma.detectedCli.findUnique({ where: { kind: b.cliKind } });
    if (!detected?.present) {
      return reply.status(400).send({ error: 'Esta CLI não está instalada na máquina.' });
    }
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const { raw, prefix } = generateProxyKey();
    const keyHash = await hashSecret(raw);
    const key = await prisma.proxyKey.create({
      data: {
        ownerId,
        name: b.name,
        cliKind: b.cliKind,
        defaultModel: b.defaultModel ?? null,
        allowedModels: b.allowedModels,
        corsOrigins: b.corsOrigins,
        keyHash,
        prefix,
        rateLimitPerMin: b.rateLimitPerMin,
        dailyTokenQuota: b.dailyTokenQuota,
        maxInputChars: b.maxInputChars,
        timeoutMs: b.timeoutMs,
        expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
      },
    });
    await writeAudit(req.authUser?.id, 'key.create', key.id, { name: b.name, cliKind: b.cliKind });
    const { publicBaseUrl } = loadConfig();
    // raw retornada UMA vez só
    return reply.status(201).send({
      key: { ...key, keyHash: undefined },
      rawKey: raw,
      preview: {
        openaiBaseUrl: `${publicBaseUrl}/v1`,
        anthropicBaseUrl: `${publicBaseUrl}/v1`,
        curlExample: `curl ${publicBaseUrl}/v1/chat/completions -H "Authorization: Bearer ${raw}" -H "Content-Type: application/json" -d '{"model":"${key.defaultModel ?? 'default'}","messages":[{"role":"user","content":"Olá"}]}'`,
      },
    });
  });

  // Editar limites/config de uma key (não muda a raw key). Isolado por dono.
  app.patch('/api/keys/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateKey.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    const b = parsed.data;
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const { count } = await prisma.proxyKey.updateMany({
      where: { id, ownerId },
      data: {
        ...(b.name !== undefined && { name: b.name }),
        ...(b.defaultModel !== undefined && { defaultModel: b.defaultModel }),
        ...(b.allowedModels !== undefined && { allowedModels: b.allowedModels }),
        ...(b.corsOrigins !== undefined && { corsOrigins: b.corsOrigins }),
        ...(b.rateLimitPerMin !== undefined && { rateLimitPerMin: b.rateLimitPerMin }),
        ...(b.dailyTokenQuota !== undefined && { dailyTokenQuota: b.dailyTokenQuota }),
        ...(b.maxInputChars !== undefined && { maxInputChars: b.maxInputChars }),
        ...(b.timeoutMs !== undefined && { timeoutMs: b.timeoutMs }),
        ...(b.enabled !== undefined && { enabled: b.enabled }),
        ...(b.expiresAt !== undefined && { expiresAt: b.expiresAt ? new Date(b.expiresAt) : null }),
      },
    });
    if (count === 0) return reply.status(404).send({ error: 'Key não encontrada.' });
    const key = await prisma.proxyKey.findUnique({ where: { id } });
    return reply.send({ key: key ? { ...key, keyHash: undefined } : null });
  });

  // Rotaciona a raw key mantendo a config (revoga a antiga implicitamente). Isolado por dono.
  app.post('/api/keys/:id/rotate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const { raw, prefix } = generateProxyKey();
    const keyHash = await hashSecret(raw);
    const { count } = await prisma.proxyKey.updateMany({
      where: { id, ownerId },
      data: { keyHash, prefix, revokedAt: null, enabled: true },
    });
    if (count === 0) return reply.status(404).send({ error: 'Key não encontrada.' });
    const key = await prisma.proxyKey.findUnique({ where: { id } });
    await writeAudit(req.authUser?.id, 'key.rotate', id);
    return reply.send({ key: key ? { ...key, keyHash: undefined } : null, rawKey: raw });
  });

  app.post('/api/keys/:id/revoke', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const { count } = await prisma.proxyKey.updateMany({
      where: { id, ownerId },
      data: { revokedAt: new Date(), enabled: false },
    });
    if (count === 0) return reply.status(404).send({ error: 'Key não encontrada.' });
    await writeAudit(req.authUser?.id, 'key.revoke', id);
    return reply.send({ ok: true });
  });

  app.delete('/api/keys/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ownerId = await resolveOwnerId(req.authUser?.id);
    const { count } = await prisma.proxyKey.deleteMany({ where: { id, ownerId } });
    if (count === 0) return reply.status(404).send({ error: 'Key não encontrada.' });
    await writeAudit(req.authUser?.id, 'key.delete', id);
    return reply.send({ ok: true });
  });
}
