import type { FastifyInstance } from 'fastify';
import { prisma } from '@llm-proxy/db';
import { buildCapabilityMatrix, type CliKind } from '@llm-proxy/shared-types';

/**
 * Matriz de capacidades FUNCIONAIS para a tela Router/Workflow.
 * Cruza a matriz estática (o que cada CLI cumpre) com o que está DISPONÍVEL na
 * instância: CLIs detectadas (present) e habilitadas (CliConfig.enabled), para a
 * UI só oferecer opções reais por bloco.
 */
export function registerCapabilityRoutes(app: FastifyInstance): void {
  app.get('/api/capabilities', async (req, reply) => {
    const includeAll = (req.query as { all?: string } | undefined)?.all === '1';

    // CLIs realmente utilizáveis = detectadas presentes E habilitadas na config.
    const [detected, configs] = await Promise.all([
      prisma.detectedCli.findMany({ where: { present: true }, select: { kind: true } }),
      prisma.cliConfig.findMany({ where: { enabled: true }, select: { kind: true } }),
    ]);
    const present = new Set(detected.map((d) => d.kind));
    const enabled = new Set(configs.map((c) => c.kind));
    const available = [...enabled].filter((k) => present.has(k)) as CliKind[];

    // `all=1` devolve a matriz completa (todas as CLIs conhecidas) — útil p/ a UI
    // mostrar opções "instale/habilite para usar" desabilitadas.
    const matrix = buildCapabilityMatrix(includeAll ? undefined : available);

    return reply.send({
      matrix,
      available,
      // conjunto completo p/ a UI marcar o que falta habilitar
      knownButUnavailable: includeAll ? [] : undefined,
    });
  });
}
