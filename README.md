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

Requirements: **Node.js 22+**, **pnpm** (`npm i -g pnpm`), and **Docker** (for Postgres + Redis).
Check with `node -v` (must be ≥ 22) and `docker info` (Docker must be running).

```bash
git clone https://github.com/BSNSolution/llm-proxy-api.git
cd llm-proxy-api
pnpm install
cp .env.example .env

# start Postgres + Redis
pnpm docker:dev
# apply the database schema (non-interactive)
pnpm db:deploy

# run api + web in dev
pnpm dev
```

Open the **web UI at http://localhost:5174** (the API/proxy runs on `:8787`) —
on the first run you'll be asked to **create your admin account**. That's it.

> In the single-process production build (below), both the UI and the API are
> served together on `API_PORT` (default `8787`).

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

### Run without local CLIs — HTTP provider mode (VPS / Cloudflare / any container)

You don't need the CLIs to run in a server/container. In **Fontes & Combos** configure an
**HTTP provider** API key (Anthropic, OpenAI or Gemini). The proxy then talks directly to
that provider over HTTPS — mirroring the same CLI capabilities — so it works anywhere,
including stateless environments with no OAuth on disk.

The routing is **hybrid**: on a machine with the CLI installed the proxy uses the CLI
(your subscription); where the CLI is missing it automatically falls back to the matching
HTTP provider. Combos and the Capability Router honor both. This is only for providers that
mirror the CLIs we already support — it is **not** a general provider catalog.

### Prebuilt image (GHCR)

```bash
docker pull ghcr.io/bsnsolution/llm-proxy-api:latest
```

The image is published on push to `main` by the `docker-publish` workflow.

### Deploy to a server (ready-made examples)

Ready-to-use compose files per platform live in [`deploy/`](deploy/):

| Platform | Example |
|---|---|
| **Dokploy** | [`deploy/dokploy/`](deploy/dokploy/) — domain/HTTPS managed by the panel |
| **EasyPanel** | [`deploy/easypanel/`](deploy/easypanel/) |
| **VPS + Traefik** | [`deploy/vps-traefik/`](deploy/vps-traefik/) — self-contained, auto HTTPS |
| **VPS + Caddy** | [`deploy/vps-caddy/`](deploy/vps-caddy/) — simplest, auto HTTPS |

Each folder has its own README and (for the VPS ones) a `.env.example`. See
[`deploy/README.md`](deploy/README.md) for which to pick and the security notes.

> On a server the container has no local CLIs — after first login, add an **HTTP
> provider** API key in *Fontes & Combos* so the proxy has an LLM to route to
> (the hybrid mode described above).

## Using your key in other tools

1. In the panel, go to **Proxy API** and create a key for an installed & active CLI.
2. In the other tool's "AI provider" / "custom OpenAI endpoint" settings, fill in:

| Field    | Value                                             |
|----------|---------------------------------------------------|
| Base URL | `http://<host>:8787/v1` (your proxy)              |
| API Key  | the `sk-llmp-…` key you generated                 |
| Model    | see the model values below                        |

The `model` field accepts, besides a plain CLI model (e.g. `sonnet`, `default`):

| `model` value        | What it does                                                        |
|----------------------|--------------------------------------------------------------------|
| `sonnet`, `default`… | Use that specific model on the key's CLI                           |
| `combo:<slug>`       | Run a **combo** (ordered fallback across LLMs)                     |
| `router`             | **Capability Router** — auto-detects the task and picks the LLM    |
| `router:<slug>`      | A named router                                                     |
| `cap:<capability>`   | Force a capability (e.g. `cap:analisar-imagem`, `cap:gerar-html`)  |

Optional request headers:

| Header                        | Effect                                              |
|-------------------------------|-----------------------------------------------------|
| `X-LLMProxy-Token-Saver: off` | Disable tool-output compression for this request    |
| `X-LLMProxy-Terseness: caveman` \| `ponytail[:lite\|full\|ultra]` | Terse output style (fewer output tokens) |

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
