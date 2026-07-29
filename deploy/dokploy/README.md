# Deploy no Dokploy

Este é o compose **validado em produção** (llm.bsnsolution.com.br). O Dokploy
gerencia o domínio e o HTTPS pelo painel — **não** declare labels Traefik aqui.

## Passos

1. No Dokploy: **Create Project** → dentro dele **Create Service → Compose**.
2. **Source**: aponte para este repositório (GitHub), branch `main`, compose path
   `./deploy/dokploy/docker-compose.yml` (ou copie o conteúdo).
3. **Environment** (aba Environment do serviço) — defina no mínimo:
   ```
   POSTGRES_PASSWORD=<senha-forte>
   SESSION_SECRET=<64+ chars aleatórios>
   PUBLIC_BASE_URL=https://llm.seudominio.com
   ```
4. **Domains** (aba Domains do serviço): adicione `llm.seudominio.com` →
   service **`llmp-app`**, port **`8787`**, HTTPS **Let's Encrypt**.
   > O DNS precisa apontar para o servidor (um A record, ou wildcard `*.seudominio.com`).
5. **Deploy**. Primeiro build aplica as migrations e sobe. Abra a URL → crie o admin.

## Notas

- Nomes de serviço são **prefixados `llmp-`** de propósito: a `dokploy-network` é
  compartilhada entre projetos; `postgres`/`redis` genéricos colidiriam.
- `autoDeploy` liga o rebuild a cada push na `main` (se o webhook estiver ativo).
- Depois de subir, configure uma **fonte HTTP** em Fontes & Combos (o container
  não tem CLIs locais). Veja o [README de deploy](../README.md).
