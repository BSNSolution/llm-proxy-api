# Deploy — exemplos por plataforma

Exemplos prontos de `docker-compose` para subir o **LLM Proxy API** num servidor/VPS.
Escolha o que combina com o seu ambiente:

| Você usa… | Use o exemplo | Domínio/HTTPS |
|---|---|---|
| **Dokploy** | [`dokploy/`](./dokploy/) | Configurado no painel do Dokploy (Traefik + Let's Encrypt) |
| **EasyPanel** | [`easypanel/`](./easypanel/) | Configurado no painel do EasyPanel |
| **VPS "na mão" com Traefik** | [`vps-traefik/`](./vps-traefik/) | Labels Traefik + Let's Encrypt no próprio compose |
| **VPS "na mão" com Caddy** | [`vps-caddy/`](./vps-caddy/) | Caddy faz HTTPS automático (mais simples) |
| **Só quero testar local** | [`../docker-compose.yml`](../docker-compose.yml) (raiz) | Sem HTTPS, acesso por `localhost:8787` |

> O `docker-compose.yml` na raiz do repo é o "genérico" (local/teste). Os exemplos aqui
> são versões **prontas para produção** com nomes de serviço únicos e reverse proxy.

---

## ⚠️ Leia antes de subir

**1. Modo de execução — CLI local vs HTTP.** O proxy roda as suas LLM **CLIs**
(claude/codex/gemini…). Num container **não há CLIs instaladas nem login OAuth**, então:

- O **painel, login, setup e gestão** funcionam normalmente.
- Para o **proxy de fato responder** (Chat e `/v1`), configure uma **fonte HTTP** em
  **Fontes & Combos**: cole uma API key da **Anthropic**, **OpenAI** ou **Google Gemini**.
  O proxy passa a falar direto com o provider por HTTPS (modo híbrido).

Sem uma fonte HTTP (e sem CLI), o app sobe mas o proxy não tem para onde despachar.

**2. Nunca exponha o proxy cru na internet sem proteção.** Ele dá acesso às suas
credenciais de LLM. Use HTTPS + a autenticação do próprio app (que já vem), e de
preferência uma allowlist de origem/IP ou tailnet (Tailscale) na frente.

**3. Primeiro acesso.** Abra a URL → a tela de **Setup** pede para criar a conta de
administrador. Sem `ADMIN_EMAIL`/`ADMIN_PASSWORD` no env, é criado interativamente.

**4. Secrets.** Sempre troque `POSTGRES_PASSWORD` e defina um `SESSION_SECRET` forte
(ou deixe o app gerar e persistir em `/data`). Nunca use os defaults em produção.

---

## Imagem pronta (GHCR)

Todos os exemplos usam `build:` do repositório. Se preferir a **imagem publicada**
(sem buildar no servidor), troque `build:` por:

```yaml
image: ghcr.io/bsnsolution/llm-proxy-api:latest
```
