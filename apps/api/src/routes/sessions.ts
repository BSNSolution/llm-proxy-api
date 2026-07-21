import type { FastifyInstance } from 'fastify';
import { prisma } from '@llm-proxy/db';
import { writeAudit } from '../services/audit.js';

/**
 * Gestão de sessões de UI (login ativo). Cada usuário vê/revoga as PRÓPRIAS
 * sessões; admin pode ver/revogar as de qualquer usuário. A sessão atual é
 * marcada para o usuário não se deslogar sem querer.
 */
export function registerSessionRoutes(app: FastifyInstance): void {
  // Lista sessões ativas. ?all=1 (admin) mostra de todos os usuários.
  app.get('/api/sessions', async (req, reply) => {
    const me = req.authUser;
    if (!me) return reply.status(401).send({ error: 'Não autenticado.' });
    const all = (req.query as { all?: string }).all === '1' && me.role === 'admin';

    const sessions = await prisma.session.findMany({
      where: { expiresAt: { gt: new Date() }, ...(all ? {} : { userId: me.id }) },
      orderBy: { lastSeenAt: 'desc' },
      include: { user: { select: { email: true, name: true } } },
    });

    return reply.send({
      sessions: sessions.map((s) => ({
        id: s.id,
        current: s.id === me.sessionId,
        userEmail: s.user.email,
        userName: s.user.name,
        userAgent: s.userAgent,
        ip: s.ip,
        lastSeenAt: s.lastSeenAt,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
    });
  });

  // Revoga uma sessão (própria; ou qualquer uma se admin). Não permite revogar a atual por aqui.
  app.delete('/api/sessions/:id', async (req, reply) => {
    const me = req.authUser;
    if (!me) return reply.status(401).send({ error: 'Não autenticado.' });
    const { id } = req.params as { id: string };
    if (id === me.sessionId) {
      return reply.status(400).send({ error: 'Use Sair para encerrar a sessão atual.' });
    }
    const target = await prisma.session.findUnique({ where: { id } });
    if (!target || (me.role !== 'admin' && target.userId !== me.id)) {
      return reply.status(404).send({ error: 'Sessão não encontrada.' });
    }
    await prisma.session.delete({ where: { id } });
    await writeAudit(me.id, 'session.revoke', id, { ofUser: target.userId });
    return reply.send({ ok: true });
  });

  // Revoga TODAS as outras sessões do próprio usuário (mantém a atual).
  app.post('/api/sessions/revoke-others', async (req, reply) => {
    const me = req.authUser;
    if (!me) return reply.status(401).send({ error: 'Não autenticado.' });
    const { count } = await prisma.session.deleteMany({
      where: { userId: me.id, id: { not: me.sessionId } },
    });
    await writeAudit(me.id, 'session.revoke_others', me.id, { count });
    return reply.send({ ok: true, revoked: count });
  });
}
