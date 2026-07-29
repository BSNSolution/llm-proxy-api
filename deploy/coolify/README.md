# Deploy no Coolify

O Coolify roda `docker-compose` — o fluxo é praticamente igual ao do EasyPanel.

## Passos

1. No Coolify: **New Resource → Docker Compose** (dentro de um projeto).
2. **Source**: aponte para este repositório, compose path
   `deploy/coolify/docker-compose.yml` (ou cole o conteúdo).
3. **Environment Variables** — defina no mínimo:
   ```
   POSTGRES_PASSWORD=<senha-forte>
   SESSION_SECRET=<64+ chars aleatórios>
   PUBLIC_BASE_URL=https://llm.seudominio.com
   ```
4. **Domains**: adicione `llm.seudominio.com` no serviço `llmp-app` (porta `8787`).
   O Coolify cuida do HTTPS (Let's Encrypt via Traefik/Caddy interno). Aponte o DNS.
5. **Deploy**. Abra a URL → crie o admin na tela de Setup.

## Notas

- O compose usa `build.context: ../..` (o Dockerfile está na raiz do repo). Se
  preferir não buildar no servidor, troque por `image: ghcr.io/bsnsolution/llm-proxy-api:latest`
  (linha comentada no arquivo).
- Container não tem CLIs → configure uma **fonte HTTP** em Fontes & Combos.
