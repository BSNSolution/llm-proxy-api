import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@llm-proxy/db';
import { encryptSecret } from '@llm-proxy/crypto';
import { loadConfig } from '@llm-proxy/config';
import { writeAudit } from '../services/audit.js';
import { invalidateHttpKeysCache } from '../services/http-providers.js';

// Credenciais HTTP por provider — habilitam deploy em container/VPS/CF (sem CLI)
// e itens HTTP em combos. A API key é CIFRADA (AES-256-GCM) e nunca devolvida.
const UpsertProvider = z.object({
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  apiKey: z.string().min(8),
  baseUrl: z.string().url().nullable().optional(),
  enabled: z.boolean().default(true),
});

/** Mascara uma key para exibição (só o formato, nunca o valor). */
function mask(len: number): string {
  return `••••••••${len > 4 ? ` (${len} caracteres)` : ''}`;
}

export function registerHttpProviderRoutes(app: FastifyInstance): void {
  // Lista os providers configurados — SEM a key (só se está setada + mascarada).
  app.get('/api/http-providers', async (_req, reply) => {
    const rows = await prisma.httpProviderConfig.findMany({ orderBy: { provider: 'asc' } });
    return reply.send({
      providers: rows.map((r) => ({
        provider: r.provider,
        enabled: r.enabled,
        baseUrl: r.baseUrl,
        keySet: true,
        keyMasked: mask(r.apiKeyCipher.length),
        updatedAt: r.updatedAt,
      })),
    });
  });

  // Cria/atualiza a credencial de um provider (upsert por provider).
  app.post('/api/http-providers', async (req, reply) => {
    const parsed = UpsertProvider.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Inválido.' });
    const { provider, apiKey, baseUrl, enabled } = parsed.data;
    const cipher = encryptSecret(apiKey, loadConfig().sessionSecret);

    await prisma.httpProviderConfig.upsert({
      where: { provider },
      create: { provider, apiKeyCipher: cipher, baseUrl: baseUrl ?? null, enabled },
      update: { apiKeyCipher: cipher, baseUrl: baseUrl ?? null, enabled },
    });
    invalidateHttpKeysCache();
    await writeAudit(req.authUser?.id, 'http-provider.upsert', provider);
    return reply.status(201).send({ ok: true });
  });

  app.delete('/api/http-providers/:provider', async (req, reply) => {
    const { provider } = req.params as { provider: string };
    const existing = await prisma.httpProviderConfig.findUnique({ where: { provider: provider as never } });
    if (!existing) return reply.status(404).send({ error: 'Provider não configurado.' });
    await prisma.httpProviderConfig.delete({ where: { provider: provider as never } });
    invalidateHttpKeysCache();
    await writeAudit(req.authUser?.id, 'http-provider.delete', provider);
    return reply.send({ ok: true });
  });
}
