#!/bin/sh
set -e

# Aplica migrations pendentes ANTES de subir o app (senão o banco fica sem tabelas).
# `migrate deploy` é idempotente: não faz nada se já estiver em dia.
# Retry: mesmo com depends_on healthy, o Postgres pode não aceitar conexão no
# primeiro instante do boot — tenta algumas vezes antes de desistir, para não
# entrar em restart-loop por uma indisponibilidade transitória.
echo "[entrypoint] aplicando migrations (prisma migrate deploy)..."
i=1
until pnpm --filter @llm-proxy/db exec prisma migrate deploy; do
  if [ "$i" -ge 10 ]; then
    echo "[entrypoint] ERRO: migrations falharam após 10 tentativas" >&2
    exit 1
  fi
  echo "[entrypoint] banco indisponível — tentativa $i/10, aguardando 3s..." >&2
  i=$((i + 1))
  sleep 3
done

# Seed opcional: só cria admin se ADMIN_EMAIL/ADMIN_PASSWORD estiverem no ambiente.
# Sem eles, o admin é criado no PRIMEIRO ACESSO pela tela de setup do app.
echo "[entrypoint] seed (admin via env, se definido)..."
pnpm --filter @llm-proxy/db run seed || echo "[entrypoint] seed pulado"

echo "[entrypoint] iniciando app..."
exec node apps/api/dist/main.js
