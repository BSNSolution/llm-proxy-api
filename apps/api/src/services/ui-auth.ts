import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@llm-proxy/db';
import { loadConfig } from '@llm-proxy/config';
import { fastHash, hashSecret, randomToken, verifySecret } from '@llm-proxy/crypto';

const SESSION_COOKIE = 'llmp_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/** Cookie deve ter `secure` quando o app é servido por HTTPS (evita trafegar em claro). */
function cookieSecure(): boolean {
  const { publicBaseUrl } = loadConfig();
  return publicBaseUrl.startsWith('https://');
}

/** True se NÃO existe nenhum usuário ainda → primeiro acesso (precisa criar admin). */
export async function needsSetup(): Promise<boolean> {
  return (await prisma.user.count()) === 0;
}

/**
 * Cria o PRIMEIRO admin (first-run). Só funciona se ainda não há usuários.
 * Retorna o token de sessão (já loga) ou null se já existir admin (corrida).
 */
export async function bootstrapAdmin(
  email: string,
  password: string,
  name: string | undefined,
  meta: SessionMeta = {},
): Promise<string | null> {
  // hash é pesado — calcula ANTES da transação (não segura o lock à toa).
  const passwordHash = await hashSecret(password);
  // Atômico contra corrida (TOCTOU): um advisory lock serializa o bootstrap.
  // A 2ª requisição concorrente espera o lock e então vê count>0 → aborta.
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4771)`; // chave arbitrária fixa p/ bootstrap
    const count = await tx.user.count();
    if (count > 0) return null;
    return tx.user.create({ data: { email, name: name ?? null, passwordHash, role: 'admin' } });
  });
  if (!user) return null;
  return createUiSession(user.id, meta);
}

/** Metadados do dispositivo/origem, para a tela de gestão de sessões. */
export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

/** Cria uma sessão de UI para um usuário e devolve o token cru (vai no cookie). */
export async function createUiSession(userId: string, meta: SessionMeta = {}): Promise<string> {
  const raw = randomToken(32); // 256 bits de entropia
  // hash rápido (SHA-256) → lookup O(1) indexado; argon2 seria desperdício (token não é senha)
  const tokenHash = fastHash(raw);
  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      ip: meta.ip ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return raw;
}

/** Faz login por email+senha. Retorna o token cru, ou null (credencial inválida / usuário desativado). */
export async function login(
  email: string,
  password: string,
  meta: SessionMeta = {},
): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.disabled) return null;
  if (!(await verifySecret(user.passwordHash, password))) return null;
  return createUiSession(user.id, meta);
}

/** Resolve o usuário a partir do cookie de sessão. */
export async function resolveSession(
  req: FastifyRequest,
): Promise<{ id: string; email: string; name: string | null; role: string; sessionId: string } | null> {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return null;
  // lookup direto O(1) pelo hash rápido do token (sem varrer + argon2 por request)
  const s = await prisma.session.findUnique({
    where: { tokenHash: fastHash(raw) },
    include: { user: true },
  });
  if (!s || s.expiresAt <= new Date()) return null;
  // usuário desativado depois de logado → sessão deixa de valer
  if (s.user.disabled) return null;
  // atualiza "visto por último" (best-effort, não bloqueia a request)
  void prisma.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  return {
    id: s.user.id,
    email: s.user.email,
    name: s.user.name,
    role: s.user.role,
    sessionId: s.id,
  };
}

export async function logout(req: FastifyRequest): Promise<void> {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return;
  await prisma.session.delete({ where: { tokenHash: fastHash(raw) } }).catch(() => {});
}

export function setSessionCookie(reply: FastifyReply, raw: string): void {
  reply.setCookie(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', secure: cookieSecure() });
}

export { SESSION_COOKIE };
