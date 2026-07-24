# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# LLM Proxy API — imagem do app (api Fastify servindo o web SPA).
#
# ⚠️ Este app SPAWNA as LLM CLIs locais (claude, codex, gemini, …), que
# dependem de OAuth/credenciais na máquina host. Para o proxy/chat funcionarem,
# as CLIs precisam estar disponíveis e logadas NO AMBIENTE onde o container roda
# (monte os diretórios de credencial como volumes, ou rode na máquina). As
# imagens GERADAS são persistidas via volume em IMAGES_DIR (ver docker-compose).
# ─────────────────────────────────────────────────────────────

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---- deps + build ----
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps ./apps
COPY tsconfig*.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# Prisma client + build de produção (tsc packages -> tsup api -> vite web)
RUN pnpm --filter @llm-proxy/db exec prisma generate
RUN pnpm build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
# Diretório de imagens geradas — montado como VOLUME no compose (persiste em rebuild).
ENV IMAGES_DIR=/data/images
RUN mkdir -p /data/images

# Copia o necessário para rodar (app buildado + node_modules + prisma + workspace).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY infra/docker-entrypoint.sh ./infra/docker-entrypoint.sh
RUN chmod +x ./infra/docker-entrypoint.sh

EXPOSE 8787
# O entrypoint aplica migrations (migrate deploy) + seed antes de subir o app.
# O bind (API_HOST) vem do env; em container use 0.0.0.0 (rede do compose).
ENTRYPOINT ["./infra/docker-entrypoint.sh"]
