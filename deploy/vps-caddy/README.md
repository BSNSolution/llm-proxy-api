# Deploy em VPS com Caddy

O jeito **mais simples** de ter HTTPS: o Caddy emite e renova o certificado
sozinho. Stack completa e isolada (Caddy + app + Postgres + Redis).

## Pré-requisitos

- VPS com **Docker** + **docker compose**.
- Domínio com registro **A** apontando para o IP da VPS.
- Portas **80** e **443** abertas.

## Subir

```bash
git clone https://github.com/BSNSolution/llm-proxy-api.git
cd llm-proxy-api/deploy/vps-caddy
cp .env.example .env
# edite .env: DOMAIN, POSTGRES_PASSWORD, SESSION_SECRET
docker compose up -d
```

Abra `https://llm.seudominio.com` → crie o admin na tela de Setup.

O HTTPS é automático (o `Caddyfile` só tem `{$DOMAIN} { reverse_proxy app:8787 }`).

## Depois

- Configure uma **fonte HTTP** em Fontes & Combos (o container não tem CLIs).
- Atualizar: `git pull && docker compose up -d --build`.
- **Segurança**: o proxy dá acesso às suas credenciais de LLM — além do HTTPS +
  login do app, considere restringir por IP/tailnet. Troque os defaults de senha.
