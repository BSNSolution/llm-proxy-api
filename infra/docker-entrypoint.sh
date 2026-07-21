#!/bin/sh
set -e

# Aplica migrations pendentes ANTES de subir o app (senão o banco fica sem tabelas).
# `migrate deploy` é idempotente: não faz nada se já estiver em dia.
echo "[entrypoint] aplicando migrations (prisma migrate deploy)..."
pnpm --filter @llm-proxy/db exec prisma migrate deploy || {
  echo "[entrypoint] ERRO ao aplicar migrations" >&2
  exit 1
}

# Seed opcional: só cria admin se ADMIN_EMAIL/ADMIN_PASSWORD estiverem no ambiente.
# Sem eles, o admin é criado no PRIMEIRO ACESSO pela tela de setup do app.
echo "[entrypoint] seed (admin via env, se definido)..."
pnpm --filter @llm-proxy/db run seed || echo "[entrypoint] seed pulado"

echo "[entrypoint] iniciando app..."
exec node apps/api/dist/main.js
