import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  bootstrapAdmin,
  clearSessionCookie,
  login,
  logout,
  needsSetup,
  resolveSession,
  setSessionCookie,
} from '../services/ui-auth.js';
import { writeAudit } from '../services/audit.js';

const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const SetupBody = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  password: z.string().min(6),
});

export function registerAuthRoutes(app: FastifyInstance): void {
  // First-run: o front pergunta se precisa criar o admin inicial.
  app.get('/api/auth/status', async (_req, reply) => {
    return reply.send({ needsSetup: await needsSetup() });
  });

  // First-run: cria o PRIMEIRO admin e já loga. Só funciona com 0 usuários.
  app.post('/api/auth/setup', async (req, reply) => {
    const parsed = SetupBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Dados inválidos.' });
    const raw = await bootstrapAdmin(parsed.data.email, parsed.data.password, parsed.data.name, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    if (!raw) return reply.status(409).send({ error: 'A configuração inicial já foi concluída.' });
    setSessionCookie(reply, raw);
    await writeAudit(undefined, 'admin.bootstrap', undefined, { email: parsed.data.email });
    return reply.status(201).send({ ok: true });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Dados inválidos.' });
    const raw = await login(parsed.data.email, parsed.data.password, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    if (!raw) return reply.status(401).send({ error: 'Credenciais inválidas ou usuário desativado.' });
    setSessionCookie(reply, raw);
    return reply.send({ ok: true });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await logout(req);
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', async (req, reply) => {
    const user = await resolveSession(req);
    if (!user) return reply.status(401).send({ error: 'Não autenticado.' });
    return reply.send({ user });
  });
}
