# Deploy em VPS com Traefik

Stack completa e isolada (Traefik + app + Postgres + Redis). HTTPS automático
via Let's Encrypt. Para quem não usa painel (Dokploy/EasyPanel).

## Pré-requisitos

- Uma VPS com **Docker** + **docker compose**.
- Um domínio com um registro **A** apontando para o IP da VPS (ex.:
  `llm.seudominio.com → 1.2.3.4`). O DNS precisa resolver antes de subir (o
  Let's Encrypt valida por HTTP-01 na porta 80).
- Portas **80** e **443** abertas no firewall.

## Subir

```bash
git clone https://github.com/BSNSolution/llm-proxy-api.git
cd llm-proxy-api/deploy/vps-traefik
cp .env.example .env
# edite .env: DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD, SESSION_SECRET
docker compose up -d
```

Acompanhe: `docker compose logs -f app`. O primeiro boot aplica as migrations
(pode haver ~30s de 502 até o app subir e o certificado ser emitido — normal).

Abra `https://llm.seudominio.com` → crie o admin na tela de Setup.

## Depois

- Configure uma **fonte HTTP** em Fontes & Combos (o container não tem CLIs) — cole
  uma API key Anthropic/OpenAI/Gemini. Sem isso o proxy não responde.
- Atualizar: `git pull && docker compose up -d --build`.

## Segurança

O proxy dá acesso às suas credenciais de LLM. Além do HTTPS + login do app,
considere restringir por IP/tailnet na frente. **Nunca** exponha `/v1` sem a
autenticação do app (as proxy keys). Troque os defaults de senha.
