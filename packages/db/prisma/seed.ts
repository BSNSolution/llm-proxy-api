import { PrismaClient } from '@prisma/client';
import { hashSecret } from '@llm-proxy/crypto';

const prisma = new PrismaClient();

/**
 * Seed opcional e idempotente.
 *
 * NÃO cria admin por padrão: a criação do admin acontece no PRIMEIRO ACESSO do
 * app (tela de setup / POST /api/auth/setup). Isto é o que permite distribuir o
 * app sem credencial hardcoded.
 *
 * Só cria um admin aqui se ADMIN_EMAIL + ADMIN_PASSWORD estiverem no ambiente
 * (útil para deploy 100% automatizado, sem interação). Nunca sobrescreve.
 */
async function main() {
  const count = await prisma.user.count();
  if (count > 0) {
    console.log(`[seed] já existem ${count} usuário(s), nada a fazer.`);
    return;
  }
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('[seed] sem ADMIN_EMAIL/ADMIN_PASSWORD — o admin será criado no primeiro acesso (tela de setup).');
    return;
  }
  await prisma.user.create({
    data: { email, passwordHash: await hashSecret(password), role: 'admin' },
  });
  console.log(`[seed] admin criado a partir do ambiente: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
