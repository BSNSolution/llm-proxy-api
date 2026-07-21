import { detectAllClis } from '@llm-proxy/cli-engine';
import { prisma } from '@llm-proxy/db';

/** Persiste o resultado da detecção no cache (DetectedCli). */
export async function reprobeAndPersist(): Promise<void> {
  const detected = await detectAllClis();
  for (const c of detected) {
    await prisma.detectedCli
      .upsert({
        where: { kind: c.kind },
        create: {
          kind: c.kind,
          present: c.present,
          binaryPath: c.binaryPath ?? null,
          version: c.version ?? null,
          capabilities: c.capabilities as unknown as object,
          models: c.models,
          defaultModel: c.defaultModel ?? null,
          lastProbedAt: new Date(c.lastProbedAt),
        },
        update: {
          present: c.present,
          binaryPath: c.binaryPath ?? null,
          version: c.version ?? null,
          capabilities: c.capabilities as unknown as object,
          models: c.models,
          defaultModel: c.defaultModel ?? null,
          lastProbedAt: new Date(c.lastProbedAt),
        },
      })
      .catch(() => {});
  }
}

/**
 * Agenda re-probe periódico (default 24h) + um probe inicial no boot.
 * Mantém o cache de CLIs atualizado quando o usuário instala/remove uma CLI.
 */
export function scheduleReprobe(intervalMs = 24 * 60 * 60 * 1000): () => void {
  void reprobeAndPersist().catch(() => {});
  const timer = setInterval(() => void reprobeAndPersist().catch(() => {}), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
