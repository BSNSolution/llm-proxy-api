import './load-env.js'; // DEVE ser o primeiro import (carrega .env antes de qualquer loadConfig)
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { loadConfig } from '@llm-proxy/config';
import { registerOpenAiRoutes } from './proxy/openai-routes.js';
import { registerAnthropicRoutes } from './proxy/anthropic-routes.js';
import { registerDetectRoutes } from './routes/detect.js';
import { registerKeyRoutes } from './routes/keys.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerImageRoutes } from './routes/images.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSetupRoutes } from './routes/setup.js';
import { registerUserRoutes } from './routes/users.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { resolveSession } from './services/ui-auth.js';
import { scheduleReprobe } from './services/cli-reprobe.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const app = Fastify({
    logger: { level: cfg.nodeEnv === 'development' ? 'info' : 'warn' },
    // anexos (imagens/arquivos base64) podem passar do default de 1MB
    bodyLimit: 30 * 1024 * 1024,
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie, { secret: cfg.sessionSecret });

  app.get('/health', async () => ({ ok: true, service: 'llm-proxy-api' }));

  // Proxy público (OpenAI + Anthropic) — autenticado por proxy key, NÃO por sessão de UI.
  registerOpenAiRoutes(app);
  registerAnthropicRoutes(app);

  // Auth de UI (login/logout/me) — públicas.
  registerAuthRoutes(app);

  // Disponibiliza o user autenticado em req.authUser p/ as rotas de gestão.
  app.decorateRequest('authUser', null);

  // Rotas de gestão /api/* exigem sessão de UI (exceto /api/auth/*).
  app.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0] ?? '';
    if (!url.startsWith('/api/')) return; // /v1, /health passam
    if (url.startsWith('/api/auth/')) return;
    // Imagens geradas: leitura pública por URL não-adivinhável (id UUID) —
    // permite que clients do proxy (/v1) e <img src> carreguem sem sessão.
    if (req.method === 'GET' && url.startsWith('/api/images/')) return;
    const user = await resolveSession(req);
    if (!user) {
      return reply.status(401).send({ error: 'Não autenticado.', code: 'unauthenticated' });
    }
    req.authUser = user;

    // RBAC: viewer só lê em gestão. Escrita (POST/PATCH/PUT/DELETE) exige admin,
    // EXCETO ações sobre recursos do próprio usuário (validadas no handler pelo dono):
    // gerenciar as próprias sessões e usar o próprio chat.
    const isWrite = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
    const selfWriteAllowed =
      url === '/api/detect' || // detect é leitura disfarçada de POST
      url.startsWith('/api/sessions') || // revogar as próprias sessões (handler checa o dono)
      url.startsWith('/api/chat'); // usar/gerenciar o próprio chat (handler checa o dono)
    if (isWrite && !selfWriteAllowed && user.role !== 'admin') {
      return reply.status(403).send({ error: 'Apenas admin pode alterar.', code: 'forbidden' });
    }
  });

  registerDetectRoutes(app);
  registerKeyRoutes(app);
  registerChatRoutes(app);
  registerConfigRoutes(app);
  registerImageRoutes(app);
  registerSetupRoutes(app);
  registerUserRoutes(app);
  registerSessionRoutes(app);

  // Em produção, serve o web buildado (SPA) a partir do próprio servidor.
  const webDist = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    // fallback SPA: rotas não-API/não-/v1 devolvem index.html
    app.setNotFoundHandler((req, reply) => {
      const url = req.url.split('?')[0] ?? '';
      if (url.startsWith('/api/') || url.startsWith('/v1') || url === '/health') {
        return reply.status(404).send({ error: 'not_found' });
      }
      return reply.sendFile('index.html');
    });
    app.log.info(`Servindo web estático de ${webDist}`);
  }

  // Re-detecta CLIs no boot e a cada 24h (mantém o cache atualizado).
  scheduleReprobe();

  await app.listen({ port: cfg.apiPort, host: cfg.apiHost });
  app.log.info(`llm-proxy-api ouvindo em http://${cfg.apiHost}:${cfg.apiPort}`);
  app.log.info(`Proxy OpenAI:    ${cfg.publicBaseUrl}/v1/chat/completions`);
  app.log.info(`Proxy Anthropic: ${cfg.publicBaseUrl}/v1/messages`);
}

main().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
