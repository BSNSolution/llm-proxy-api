import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadConfig } from '@llm-proxy/config';
import { prisma } from '@llm-proxy/db';
import { CLI_KINDS, type CliKind, type TurnMessage } from '@llm-proxy/shared-types';
import { executeTurn } from '../services/turn-runner.js';
import { generateImage, supportsImageGen } from '../services/image-service.js';
import { sseHeaders } from '../proxy/shared.js';
import { authRateLimit } from '../services/auth-rate-limit.js';

/**
 * Chat interativo pela UI. Usa o mesmo executor de turno do proxy (cli-engine),
 * mas com histórico persistido (ChatSession/ChatMessage) e streaming SSE próprio.
 */
const CreateSession = z.object({
  cliKind: z.enum(CLI_KINDS),
  model: z.string().optional(),
  title: z.string().optional(),
});

const AttachmentSchema = z.object({
  kind: z.enum(['image', 'file', 'audio']),
  name: z.string(),
  mime: z.string(),
  dataBase64: z.string().optional(),
  path: z.string().optional(),
});

const SendMessage = z.object({
  content: z.string().min(1),
  thinking: z.boolean().optional(),
  model: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
  /** força geração de imagem (toggle "modo imagem" na UI) */
  imageMode: z.boolean().optional(),
});

/** Heurística: o texto pede geração de imagem? */
function looksLikeImageRequest(text: string): boolean {
  return /\b(gere|gera|crie|cria|desenhe|desenha|fa[çc]a|faz|gen(?:erate)?|draw|create)\b[^.!?]*\b(imagem|imagens|foto|fotos|figura|ilustra[çc][ãa]o|banner|logo|[íi]cone|arte|picture|image|photo|drawing|illustration)\b/i.test(
    text,
  );
}

async function firstUserId(reqUserId?: string): Promise<string> {
  if (reqUserId) return reqUserId;
  const u = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!u) throw new Error('Nenhum usuário (rode o seed).');
  return u.id;
}

export function registerChatRoutes(app: FastifyInstance): void {
  app.get('/api/chat/sessions', async (req, reply) => {
    const userId = await firstUserId(req.authUser?.id);
    const sessions = await prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
    return reply.send({ sessions });
  });

  app.post('/api/chat/sessions', async (req, reply) => {
    const parsed = CreateSession.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });
    const userId = await firstUserId(req.authUser?.id);
    const session = await prisma.chatSession.create({
      data: {
        userId,
        cliKind: parsed.data.cliKind,
        model: parsed.data.model ?? null,
        title: parsed.data.title ?? 'Nova conversa',
      },
    });
    return reply.status(201).send({ session });
  });

  app.get('/api/chat/sessions/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = await firstUserId(req.authUser?.id);
    // confere o dono antes de expor mensagens (evita IDOR de leitura de chat alheio)
    const owned = await prisma.chatSession.findFirst({ where: { id, userId }, select: { id: true } });
    if (!owned) return reply.status(404).send({ error: 'Sessão não encontrada.' });
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
    });
    return reply.send({ messages });
  });

  app.delete('/api/chat/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = await firstUserId(req.authUser?.id);
    const { count } = await prisma.chatSession.deleteMany({ where: { id, userId } });
    if (count === 0) return reply.status(404).send({ error: 'Sessão não encontrada.' });
    return reply.send({ ok: true });
  });

  // Envia mensagem e streama a resposta (SSE). Persiste user + assistant.
  app.post('/api/chat/sessions/:id/send', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = SendMessage.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.message });

    const userId = await firstUserId(req.authUser?.id);

    // Rate-limit por usuário: o chat executa a LLM (custo real, sobretudo via
    // provider HTTP pago). Barra abuso/automação sem atrapalhar uso interativo.
    const rl = await authRateLimit('chat-send', userId, 30, 60);
    if (!rl.ok) {
      return reply
        .status(429)
        .send({ error: 'Muitas mensagens em pouco tempo. Aguarde um instante.', retryAfter: rl.retryAfter });
    }

    const session = await prisma.chatSession.findFirst({ where: { id, userId } });
    if (!session) return reply.status(404).send({ error: 'Sessão não encontrada.' });

    // histórico anterior
    const prior = await prisma.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
    });
    const history: TurnMessage[] = prior.map((m) => ({
      role: m.role as TurnMessage['role'],
      content: m.content,
    }));

    // persiste a mensagem do usuário (guarda metadados dos anexos, sem o base64 pesado)
    const attachMeta = parsed.data.attachments?.map((a) => ({
      kind: a.kind,
      name: a.name,
      mime: a.mime,
    }));
    await prisma.chatMessage.create({
      data: {
        sessionId: id,
        role: 'user',
        content: parsed.data.content,
        ...(attachMeta?.length ? { attachments: attachMeta } : {}),
      },
    });

    reply.raw.writeHead(200, sseHeaders());
    const send = (event: string, data: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Modo imagem: explícito (toggle) OU heurística, se a CLI suportar geração.
    const wantImage =
      supportsImageGen(session.cliKind as CliKind) &&
      (parsed.data.imageMode || looksLikeImageRequest(parsed.data.content));

    if (wantImage) {
      const { publicBaseUrl } = loadConfig();
      const gen = await generateImage(session.cliKind as CliKind, parsed.data.content, {
        publicBaseUrl,
      });
      if (gen.ok) {
        send('image', { url: gen.image.url });
        await prisma.chatMessage.create({
          data: {
            sessionId: id,
            role: 'assistant',
            content: '',
            attachments: [{ kind: 'image', name: 'gerada', mime: 'image/png', url: gen.image.url }],
          },
        });
      } else {
        send('error', { message: gen.error });
      }
      await prisma.chatSession.update({ where: { id }, data: { updatedAt: new Date() } });
      send('done', { finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 0, estimated: true } });
      reply.raw.end();
      return;
    }

    let full = '';
    const result = await executeTurn(
      {
        kind: session.cliKind as CliKind,
        history,
        userMessage: {
          role: 'user',
          content: parsed.data.content,
          ...(parsed.data.attachments?.length
            ? { attachments: parsed.data.attachments }
            : {}),
        },
        options: {
          model: parsed.data.model ?? session.model ?? undefined,
          thinking: parsed.data.thinking,
          timeoutMs: 120_000,
        },
      },
      {
        onDelta: (text) => {
          full += text;
          send('delta', { text });
        },
        onThinking: (text) => send('thinking', { text }),
        onError: (message) => send('error', { message }),
      },
    );

    // persiste a resposta do assistant (trimEnd remove \n final espúrio de texto puro)
    await prisma.chatMessage.create({
      data: {
        sessionId: id,
        role: 'assistant',
        content: full.replace(/\n+$/, ''),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
    });
    await prisma.chatSession.update({ where: { id }, data: { updatedAt: new Date() } });

    send('done', { finishReason: result.finishReason, usage: result.usage });
    reply.raw.end();
  });
}
