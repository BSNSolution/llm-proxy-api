import { prisma } from '@llm-proxy/db';

/**
 * Resolve o ownerId de um recurso: o usuário autenticado, ou o primeiro admin
 * como fallback (single-machine sem sessão explícita). Compartilhado por keys,
 * combos e routers para não duplicar a mesma lógica.
 */
export async function resolveOwnerId(reqUserId?: string): Promise<string> {
  if (reqUserId) return reqUserId;
  const admin = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('Nenhum admin cadastrado (rode o seed).');
  return admin.id;
}
