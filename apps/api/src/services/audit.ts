import { prisma } from '@llm-proxy/db';

/**
 * Registra uma ação sensível no AuditLog (quem fez o quê, sobre o quê).
 * Best-effort: nunca derruba a request se o log falhar.
 */
export async function writeAudit(
  actorId: string | undefined,
  action: string,
  target?: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action,
        target: target ?? null,
        meta: (meta ?? {}) as object,
      },
    });
  } catch {
    /* log é secundário — não interrompe o fluxo principal */
  }
}
