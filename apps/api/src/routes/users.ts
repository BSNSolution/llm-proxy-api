import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@llm-proxy/db';
import { hashSecret } from '@llm-proxy/crypto';
import { writeAudit } from '../services/audit.js';

/**
 * Gestão de usuários (multi-usuário). Escrita é admin-only (o hook global de
 * /api/* já exige admin para POST/PATCH/DELETE). Cada usuário tem suas próprias
 * keys/chats isolados por ownerId (ver rotas keys/chat).
 */

const CreateUser = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  password: z.string().min(6),
  role: z.enum(['admin', 'viewer']).default('viewer'),
});

const UpdateUser = z.object({
  name: z.string().max(120).nullable().optional(),
  role: z.enum(['admin', 'viewer']).optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

function publicUser(u: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  disabled: boolean;
  createdAt: Date;
  _count?: { proxyKeys: number; sessions: number };
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    disabled: u.disabled,
    createdAt: u.createdAt,
    keysCount: u._count?.proxyKeys ?? 0,
    sessionsCount: u._count?.sessions ?? 0,
  };
}

export function registerUserRoutes(app: FastifyInstance): void {
  // Lista de usuários (só admin — expõe papéis/estado de outras contas).
  app.get('/api/users', async (req, reply) => {
    if (req.authUser?.role !== 'admin') {
      return reply.status(403).send({ error: 'Apenas admin.' });
    }
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { proxyKeys: true, sessions: true } } },
    });
    return reply.send({ users: users.map(publicUser) });
  });

  // Criar usuário.
  app.post('/api/users', async (req, reply) => {
    const parsed = CreateUser.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    const { email, name, password, role } = parsed.data;
    const passwordHash = await hashSecret(password);
    let user;
    try {
      user = await prisma.user.create({
        data: { email, name: name ?? null, passwordHash, role },
        include: { _count: { select: { proxyKeys: true, sessions: true } } },
      });
    } catch (err) {
      // P2002 = violação de unique (email) — inclusive sob corrida (2 requests iguais).
      if ((err as { code?: string }).code === 'P2002') {
        return reply.status(409).send({ error: 'Já existe um usuário com este e-mail.' });
      }
      throw err;
    }
    await writeAudit(req.authUser?.id, 'user.create', user.id, { email, role });
    return reply.status(201).send({ user: publicUser(user) });
  });

  // Editar usuário (nome, papel, ativar/desativar, resetar senha).
  app.patch('/api/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateUser.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    const b = parsed.data;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.status(404).send({ error: 'Usuário não encontrado.' });

    // trava de segurança: não rebaixar/desativar o ÚLTIMO admin ativo
    if ((b.role === 'viewer' || b.disabled === true) && target.role === 'admin' && !target.disabled) {
      const activeAdmins = await prisma.user.count({ where: { role: 'admin', disabled: false } });
      if (activeAdmins <= 1) {
        return reply.status(400).send({ error: 'Não é possível remover/desativar o último admin ativo.' });
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(b.name !== undefined && { name: b.name }),
        ...(b.role !== undefined && { role: b.role }),
        ...(b.disabled !== undefined && { disabled: b.disabled }),
        ...(b.password !== undefined && { passwordHash: await hashSecret(b.password) }),
      },
      include: { _count: { select: { proxyKeys: true, sessions: true } } },
    });
    // desativou → revoga todas as sessões do usuário (força logout imediato)
    if (b.disabled === true) {
      await prisma.session.deleteMany({ where: { userId: id } });
    }
    await writeAudit(req.authUser?.id, 'user.update', id, {
      role: b.role,
      disabled: b.disabled,
      passwordReset: b.password !== undefined,
    });
    return reply.send({ user: publicUser(user) });
  });

  // Excluir usuário (e tudo dele por cascade). Não pode excluir a si mesmo nem o último admin.
  app.delete('/api/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (req.authUser?.id === id) {
      return reply.status(400).send({ error: 'Você não pode excluir a própria conta.' });
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.status(404).send({ error: 'Usuário não encontrado.' });
    if (target.role === 'admin' && !target.disabled) {
      const activeAdmins = await prisma.user.count({ where: { role: 'admin', disabled: false } });
      if (activeAdmins <= 1) {
        return reply.status(400).send({ error: 'Não é possível excluir o último admin ativo.' });
      }
    }
    await prisma.user.delete({ where: { id } });
    await writeAudit(req.authUser?.id, 'user.delete', id, { email: target.email });
    return reply.send({ ok: true });
  });
}
