import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@llm-proxy/db';
import { encryptSecret } from '@llm-proxy/crypto';
import { loadConfig } from '@llm-proxy/config';
import { writeAudit } from '../services/audit.js';
import { invalidateHttpKeysCache } from '../services/http-providers.js';

// Credenciais HTTP por provider — habilitam deploy em container/VPS/CF (sem CLI)
// e itens HTTP em combos. A API key é CIFRADA (AES-256-GCM) e nunca devolvida.
// Anti-SSRF: mesmo sendo admin quem configura, um baseUrl apontando p/ metadata
// da nuvem (169.254.169.254) ou host interno seria confused-deputy. Exige https
// (ou http só p/ localhost em dev) e bloqueia IPs privados/link-local/metadata.
function isSafeBaseUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  // Só https (http apenas p/ localhost em dev). new URL entrega IPv6 COM colchetes
  // (ex.: "[::1]") — removemos p/ comparar; o resto do check usa o host limpo.
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (h === 'localhost' || h === '127.0.0.1'))) {
    return false;
  }
  if (h.endsWith('.internal') || h.endsWith('.local') || h === 'metadata.google.internal') return false;

  // IPv6 (URL entrega sem os colchetes): bloqueia loopback ::1, ULA fc00::/7,
  // link-local fe80::/10, unspecified ::, e IPv4-mapped ::ffff:a.b.c.d.
  if (h.includes(':')) {
    if (h === '::1' || h === '::') return false;
    if (/^f[cd]/.test(h)) return false; // fc00::/7 (ULA)
    if (/^fe[89ab]/.test(h)) return false; // fe80::/10 (link-local)
    // IPv4-mapped (::ffff:x). new URL normaliza p/ hex (::ffff:a9fe:a9fe), então
    // não dá p/ inspecionar o IPv4 — e não há uso legítimo. Bloqueia todos.
    if (h.startsWith('::ffff:')) return false;
    return true;
  }

  // IPv4 dotted-decimal → checa faixas privadas. Qualquer forma NÃO dotted-decimal
  // que seja puramente numérica (decimal 2130706433, hex 0x7f000001, octal) é
  // recusada — não há uso legítimo e são vetores de bypass p/ loopback.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return isSafeIpv4(h);
  if (/^(0x[0-9a-f]+|\d+)$/.test(h)) return false; // IP numérico não-dotted (dec/hex/octal)
  return true; // hostname normal (ex.: api.openai.com)
}

/** true se o IPv4 dotted-decimal NÃO é privado/loopback/link-local/metadata. */
function isSafeIpv4(ip: string): boolean {
  const blocked =
    /^169\.254\./.test(ip) || // link-local + metadata 169.254.169.254
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^127\./.test(ip) || // loopback inteiro (127.0.0.0/8)
    ip === '0.0.0.0' ||
    /^0\./.test(ip); // 0.0.0.0/8 (roteia p/ loopback em muitos SOs)
  return !blocked;
}

const UpsertProvider = z.object({
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  apiKey: z.string().min(8),
  baseUrl: z
    .string()
    .url()
    .refine(isSafeBaseUrl, 'baseUrl deve ser https e não pode apontar para host interno/metadata.')
    .nullable()
    .optional(),
  enabled: z.boolean().default(true),
});

/** Mascara uma key para exibição (só o formato, nunca o valor). */
function mask(len: number): string {
  return `••••••••${len > 4 ? ` (${len} caracteres)` : ''}`;
}

export function registerHttpProviderRoutes(app: FastifyInstance): void {
  // Lista os providers configurados — SEM a key (só se está setada + mascarada).
  app.get('/api/http-providers', async (_req, reply) => {
    const rows = await prisma.httpProviderConfig.findMany({ orderBy: { provider: 'asc' } });
    return reply.send({
      providers: rows.map((r) => ({
        provider: r.provider,
        enabled: r.enabled,
        baseUrl: r.baseUrl,
        keySet: true,
        keyMasked: mask(r.apiKeyCipher.length),
        updatedAt: r.updatedAt,
      })),
    });
  });

  // Cria/atualiza a credencial de um provider (upsert por provider).
  app.post('/api/http-providers', async (req, reply) => {
    const parsed = UpsertProvider.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Inválido.' });
    const { provider, apiKey, baseUrl, enabled } = parsed.data;
    const cipher = encryptSecret(apiKey, loadConfig().sessionSecret);

    await prisma.httpProviderConfig.upsert({
      where: { provider },
      create: { provider, apiKeyCipher: cipher, baseUrl: baseUrl ?? null, enabled },
      update: { apiKeyCipher: cipher, baseUrl: baseUrl ?? null, enabled },
    });
    invalidateHttpKeysCache();
    await writeAudit(req.authUser?.id, 'http-provider.upsert', provider);
    return reply.status(201).send({ ok: true });
  });

  app.delete('/api/http-providers/:provider', async (req, reply) => {
    const { provider } = req.params as { provider: string };
    const existing = await prisma.httpProviderConfig.findUnique({ where: { provider: provider as never } });
    if (!existing) return reply.status(404).send({ error: 'Provider não configurado.' });
    await prisma.httpProviderConfig.delete({ where: { provider: provider as never } });
    invalidateHttpKeysCache();
    await writeAudit(req.authUser?.id, 'http-provider.delete', provider);
    return reply.send({ ok: true });
  });
}
