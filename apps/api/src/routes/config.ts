import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@llm-proxy/db';
import { CLI_KINDS } from '@llm-proxy/shared-types';

/**
 * Configuração por CLI (CliConfig): quais estão habilitadas p/ exposição, models
 * permitidos, default, thinking, timeout. Usada pelo Setup Wizard e pela tela Config.
 */
const UpsertConfig = z.object({
  kind: z.enum(CLI_KINDS),
  enabled: z.boolean().optional(),
  defaultModel: z.string().nullable().optional(),
  allowedModels: z.array(z.string()).optional(),
  thinkingDefault: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export function registerConfigRoutes(app: FastifyInstance): void {
  app.get('/api/config', async (_req, reply) => {
    const configs = await prisma.cliConfig.findMany({ orderBy: { kind: 'asc' } });
    return reply.send({ configs });
  });

  app.put('/api/config', async (req, reply) => {
    const parsed = UpsertConfig.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    const { kind, ...rest } = parsed.data;
    const config = await prisma.cliConfig.upsert({
      where: { kind },
      create: {
        kind,
        enabled: rest.enabled ?? false,
        defaultModel: rest.defaultModel ?? null,
        allowedModels: rest.allowedModels ?? [],
        thinkingDefault: rest.thinkingDefault ?? false,
        timeoutMs: rest.timeoutMs ?? 120000,
      },
      update: {
        ...(rest.enabled !== undefined && { enabled: rest.enabled }),
        ...(rest.defaultModel !== undefined && { defaultModel: rest.defaultModel }),
        ...(rest.allowedModels !== undefined && { allowedModels: rest.allowedModels }),
        ...(rest.thinkingDefault !== undefined && { thinkingDefault: rest.thinkingDefault }),
        ...(rest.timeoutMs !== undefined && { timeoutMs: rest.timeoutMs }),
      },
    });
    return reply.send({ config });
  });
}
