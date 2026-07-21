import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CLI_KINDS, type CliKind } from '@llm-proxy/shared-types';
import { randomUUID } from '@llm-proxy/crypto';
import {
  getSetupPlan,
  installCli,
  isCliLoggedIn,
  LoginSession,
  type InstallEvent,
  type LoginEvent,
} from '@llm-proxy/cli-engine';
import { sseHeaders } from '../proxy/shared.js';
import { reprobeAndPersist } from '../services/cli-reprobe.js';

/**
 * Rotas do wizard de instalação + login das CLIs.
 * Segurança: install/login são POST → o hook global de /api/* já exige ADMIN.
 * O plano (GET) é leitura (mostra o comando ANTES de rodar, p/ confirmação).
 */

const kindParam = z.object({ kind: z.enum(CLI_KINDS) });

// Sessões de login vivas (device flow: o usuário cola código/token depois).
const loginSessions = new Map<string, LoginSession>();

export function registerSetupRoutes(app: FastifyInstance): void {
  // ---- STATUS DE LOGIN por CLI (read-only; a UI usa p/ esconder o botão login) ----
  // Escaneia credenciais locais → só admin (o hook global libera GET a qualquer sessão).
  app.get('/api/setup/login-status', async (req, reply) => {
    if (req.authUser?.role !== 'admin') {
      return reply.status(403).send({ error: 'Apenas admin.', code: 'forbidden' });
    }
    const entries = await Promise.all(
      CLI_KINDS.map(async (kind) => [kind, await isCliLoggedIn(kind as CliKind)] as const),
    );
    return reply.send({ status: Object.fromEntries(entries) });
  });

  // ---- PLANO (o que será executado; p/ mostrar e confirmar) ----
  app.get('/api/setup/plan/:kind', async (req, reply) => {
    const parsed = kindParam.safeParse(req.params);
    if (!parsed.success) return reply.status(400).send({ error: 'kind inválido' });
    return reply.send({ plan: getSetupPlan(parsed.data.kind) });
  });

  // ---- INSTALAR (SSE de progresso) ----
  app.post('/api/setup/install', async (req, reply) => {
    const parsed = z.object({ kind: z.enum(CLI_KINDS) }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'kind inválido' });
    const kind = parsed.data.kind;

    reply.raw.writeHead(200, sseHeaders());
    const send = (event: string, data: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const controller = new AbortController();
    req.raw.on('close', () => controller.abort());

    const emit = (e: InstallEvent): void => send(e.type, e);
    try {
      await installCli(kind, emit, controller.signal);
      // Persiste a nova detecção p/ a UI refletir o estado.
      await reprobeAndPersist();
    } catch (err) {
      send('error', { type: 'error', message: (err as Error).message });
    } finally {
      reply.raw.end();
    }
  });

  // ---- INICIAR LOGIN (SSE de eventos) ----
  app.post('/api/setup/login', async (req, reply) => {
    const parsed = z
      .object({
        kind: z.enum(CLI_KINDS),
        apiKey: z.string().min(1).optional(),
        headless: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'payload inválido' });
    const { kind, apiKey, headless } = parsed.data;

    reply.raw.writeHead(200, sseHeaders());
    const send = (event: string, data: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const loginId = randomUUID();
    const session = new LoginSession(kind as CliKind, (e: LoginEvent) => send(e.type, e));
    loginSessions.set(loginId, session);
    // Informa o loginId p/ o cliente poder injetar código/token via /login/input.
    send('session', { loginId });

    let finished = false;
    const cleanup = (): void => {
      if (finished) return;
      finished = true;
      loginSessions.delete(loginId);
      if (!session.isDone()) session.cancel();
      if (!reply.raw.writableEnded) reply.raw.end();
    };
    // client desconectou: cancela o login e encerra (sem reprobe redundante)
    req.raw.on('close', cleanup);

    await session.start({ apiKey, interactiveHeadless: headless });
    // Aguarda o término da sessão de login (done) antes de fechar o SSE.
    await waitUntilDone(session);
    req.raw.off('close', cleanup);
    if (!finished) {
      finished = true;
      loginSessions.delete(loginId);
      await reprobeAndPersist();
      if (!reply.raw.writableEnded) reply.raw.end();
    }
  });

  // ---- INJETAR CÓDIGO/TOKEN no login em andamento ----
  app.post('/api/setup/login/input', async (req, reply) => {
    const parsed = z
      .object({ loginId: z.string().uuid(), value: z.string().min(1) })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'payload inválido' });
    const session = loginSessions.get(parsed.data.loginId);
    if (!session) return reply.status(404).send({ error: 'sessão de login não encontrada' });
    session.submitInput(parsed.data.value);
    return reply.send({ ok: true });
  });

  // ---- CANCELAR login ----
  app.post('/api/setup/login/cancel', async (req, reply) => {
    const parsed = z.object({ loginId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'payload inválido' });
    const session = loginSessions.get(parsed.data.loginId);
    if (session) {
      session.cancel();
      loginSessions.delete(parsed.data.loginId);
    }
    return reply.send({ ok: true });
  });
}

/** Resolve quando a sessão de login termina (com timeout de guarda). */
function waitUntilDone(session: LoginSession): Promise<void> {
  return new Promise((resolve) => {
    if (session.isDone()) return resolve();
    const iv = setInterval(() => {
      if (session.isDone()) {
        clearInterval(iv);
        resolve();
      }
    }, 300);
    // Guarda: no máximo ~6min (login-runner já tem timeout interno de 5min).
    setTimeout(() => {
      clearInterval(iv);
      resolve();
    }, 6 * 60_000);
  });
}
