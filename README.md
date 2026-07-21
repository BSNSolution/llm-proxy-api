<div align="center">

# LLM Proxy API

**Turn your installed AI coding CLIs into an OpenAI/Anthropic-compatible API.**

Detects the LLM CLIs on your machine (Claude Code, Codex, Gemini, Cursor, and more),
lets you expose the ones you choose as a local **Proxy API**, and gives you a clean
web panel to manage keys, users, usage and an interactive chat.

Self-hosted · single binary experience · runs on your machine or via Docker.

</div>

---

## Why

You already pay for AI CLIs (Claude Code, Codex/ChatGPT, Gemini, …). This app lets you
**reuse those subscriptions through a standard API** — the same shape OpenAI and
Anthropic use — so any tool that accepts a custom base URL + API key can talk to them:
your own scripts, a CRM, a deploy panel, internal apps, test environments, etc.

> ⚠️ **Security first.** The proxy grants access to *your* LLM subscriptions. Never
> expose it raw on the public internet. Keep it on `localhost`, a private network, or
> behind a VPN (e.g. Tailscale) / HTTPS + auth. See [Security](#security).

## Features

- 🔎 **Auto-detects** installed LLM CLIs (Claude Code, Codex, Gemini, Cursor, OpenCode,
  Antigravity, GitHub Copilot, Aider, Qwen, Amp, Goose, Grok, Continue).
- 🧩 **Setup wizard** — detect, pick which CLIs to expose, and even install/log in to
  missing ones from the UI.
- 🔌 **Proxy API** — OpenAI-compatible (`/v1/chat/completions`, `/v1/models`) and
  Anthropic-compatible (`/v1/messages`), with streaming (SSE).
- 🔑 **API keys** with per-key model allowlist, rate limit, daily token quota and CORS.
- 👥 **Multi-user** — admin + viewer roles, per-user isolation, session management.
- 💬 **Interactive chat** with your CLIs (thinking toggle, image/file/audio attachments).
- 📊 **Usage dashboard** — requests, tokens, latency, per-model history.
- 🖥️ **Cross-platform** — macOS, Windows, Linux.
- 🐳 **Self-hosted** — run locally or deploy with Docker / Dokploy / EasyPanel.

## Quick start (local)

Requirements: **Node.js 22+**, **pnpm**, and **Docker** (for Postgres + Redis).

```bash
git clone https://github.com/BSNSolution/llm-proxy-api.git
cd llm-proxy-api
pnpm install
cp .env.example .env

# start Postgres + Redis
pnpm docker:dev
# apply the database schema
pnpm db:migrate

# run api + web in dev
pnpm dev
```

Open **http://localhost:5174** — on the first run you'll be asked to
**create your admin account**. That's it.

Production build (single process, API serves the web UI):

```bash
pnpm build
pnpm start        # serves the panel + API on API_PORT (default 8787)
```

## Run with Docker

A `docker-compose.yml` is included at the repo root (auto-detected by Dokploy / EasyPanel).

```bash
docker compose up -d
```

Then open the app URL and create the admin account on first access.

> The app container serves the panel, login and management out of the box. For the
> **proxy itself** to reach your LLM CLIs, the CLIs must be available and logged in
> inside the container's environment — mount their credential directories
> (e.g. `~/.codex`, `~/.claude`, `~/.gemini`) and make the binaries available on PATH.
> Alternatively, run the app directly on the machine that has the CLIs installed.

### Deploy with Dokploy / EasyPanel

1. Point the panel to this repository (it detects `docker-compose.yml`).
2. Set the env vars you want (see [`.env.example`](.env.example)) — all are optional.
3. Deploy, open the URL, create the admin account.

## Using your key in other tools

1. In the panel, go to **Proxy API** and create a key for an installed & active CLI.
2. In the other tool's "AI provider" / "custom OpenAI endpoint" settings, fill in:

| Field    | Value                                             |
|----------|---------------------------------------------------|
| Base URL | `http://<host>:8787/v1` (your proxy)              |
| API Key  | the `sk-llmp-…` key you generated                 |
| Model    | the CLI model (e.g. `sonnet`, `default`, …)       |

Works with anything that speaks the OpenAI or Anthropic API shape.

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer sk-llmp-..." \
  -H "Content-Type: application/json" \
  -d '{"model":"sonnet","messages":[{"role":"user","content":"Hello"}]}'
```

## Security

- The proxy exposes access to your paid LLM subscriptions — **treat the key like a password**.
- Default bind is `127.0.0.1` (localhost only). Change `API_HOST` only on a trusted network.
- To use it from another machine/server, prefer a **private network (Tailscale)** or
  **HTTPS + firewall**, never a raw public port.
- Sessions are stored server-side; the session secret is auto-generated and persisted
  (no insecure default). API keys are hashed (argon2id).
- Found a vulnerability? See [SECURITY.md](SECURITY.md).

## Tech stack

pnpm + Turborepo monorepo · **API**: Fastify (Node 22, TypeScript) · **Web**: React + Vite + Tailwind ·
**DB**: Postgres + Prisma · **Cache/limits**: Redis · CLI engine with per-CLI adapters and a process pool.

```
apps/     web (panel)  ·  api (proxy /v1 + management /api)
packages/ cli-engine · db · config · crypto · shared-types
infra/    compose (dev) · service (systemd/launchd)
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our
[Code of Conduct](CODE_OF_CONDUCT.md). Good first steps: run the app locally, open an
issue for what you'd like to change, and send a focused PR (CI runs typecheck + build).

## License

[MIT](LICENSE) © 2026 BSN Solution and contributors.
