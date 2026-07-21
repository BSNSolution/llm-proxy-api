import type { FastifyInstance } from 'fastify';
import { prisma } from '@llm-proxy/db';
import { reprobeAndPersist } from '../services/cli-reprobe.js';

/**
 * Rotas de detecção de CLIs. Usadas pelo Setup Wizard e pela tela de configs.
 * Persiste o resultado em DetectedCli (cache) e devolve a lista.
 */
export function registerDetectRoutes(app: FastifyInstance): void {
  app.post('/api/detect', async (_req, reply) => {
    await reprobeAndPersist();
    const detected = await prisma.detectedCli.findMany({ orderBy: { kind: 'asc' } });
    return reply.send({ detected });
  });

  app.get('/api/detect', async (_req, reply) => {
    const cached = await prisma.detectedCli.findMany({ orderBy: { kind: 'asc' } });
    return reply.send({ detected: cached });
  });
}
