import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadConfig } from '@llm-proxy/config';
import { CLI_KINDS, type CliKind } from '@llm-proxy/shared-types';
import { generateImage, readImage, supportsImageGen } from '../services/image-service.js';
import { authenticateProxyKey } from '../services/proxy-auth.js';
import { extractBearer, sendProxyError } from '../proxy/shared.js';

const GenBody = z.object({
  cliKind: z.enum(CLI_KINDS).default('codex'),
  prompt: z.string().min(1),
  size: z.string().optional(),
});

export function registerImageRoutes(app: FastifyInstance): void {
  // Serve a imagem gerada. Público de leitura (id é UUID não-adivinhável); o
  // preHandler de /api/* NÃO cobre isto pois usamos /api/images que exige sessão —
  // então registramos fora, checando o id.
  app.get('/api/images/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    const id = file.replace(/\.png$/i, '');
    const buf = readImage(id);
    if (!buf) return reply.status(404).send({ error: 'não encontrada' });
    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'private, max-age=86400');
    return reply.send(buf);
  });

  // Geração via UI (autenticada pelo preHandler de /api/*).
  app.post('/api/images/generate', async (req, reply) => {
    const parsed = GenBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    const { cliKind, prompt, size } = parsed.data;
    const { publicBaseUrl } = loadConfig();
    const res = await generateImage(cliKind as CliKind, prompt, { size, publicBaseUrl });
    if (!res.ok) return reply.status(422).send({ error: res.error });
    return reply.send({ image: res.image });
  });

  // Endpoint OpenAI-compatible: POST /v1/images/generations
  app.post('/v1/images/generations', async (req, reply) => {
    const auth = await authenticateProxyKey(extractBearer(req));
    if (!auth.ok) return sendProxyError(reply, auth);
    const key = auth.key;

    if (!supportsImageGen(key.cliKind as CliKind)) {
      return sendProxyError(reply, {
        ok: false,
        status: 400,
        code: 'image_not_supported',
        message: `A CLI '${key.cliKind}' desta key não gera imagens.`,
      });
    }

    const Body = z.object({
      prompt: z.string().min(1),
      size: z.string().optional(),
      n: z.number().int().positive().max(4).optional(),
      response_format: z.enum(['url', 'b64_json']).optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return sendProxyError(reply, {
        ok: false,
        status: 400,
        code: 'invalid_request',
        message: parsed.error.message,
      });
    }
    const { prompt, size, response_format } = parsed.data;
    const { publicBaseUrl } = loadConfig();

    const res = await generateImage(key.cliKind as CliKind, prompt, { size, publicBaseUrl });
    if (!res.ok) {
      return sendProxyError(reply, {
        ok: false,
        status: 500,
        code: 'image_generation_failed',
        message: res.error,
      });
    }

    const created = Math.floor(Date.now() / 1000);
    // Default = b64_json (comportamento do gpt-image oficial da OpenAI; clients como
    // o BSN Social esperam data[0].b64_json quando não pedem response_format). Só
    // devolve url quando explicitamente pedido — evita que o client precise baixar
    // uma URL do próprio proxy (que costuma ser bloqueada por anti-SSRF em localhost).
    if (response_format !== 'url') {
      const { readImage } = await import('../services/image-service.js');
      const buf = readImage(res.image.id);
      return reply.send({
        created,
        data: [{ b64_json: buf ? buf.toString('base64') : '' }],
      });
    }
    return reply.send({ created, data: [{ url: res.image.url }] });
  });
}
