# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Capability Router** — one API key that auto-detects the task (analyze image,
  generate HTML, transcribe audio…) and dispatches to the best LLM. Use
  `model: "router"`, or force with `model: "cap:<slug>"`. The Router page only
  offers models that actually support each function.
- **Combos** — ordered fallback across LLMs (`model: "combo:<slug>"`): subscription
  → cheap → free, auto-switch on quota/error. UI in *Fontes & Combos*.
- **HTTP provider mode (hybrid)** — run on any container/VPS with no local CLIs by
  configuring an Anthropic/OpenAI/Gemini API key; the proxy talks straight to the
  provider. Where a CLI exists it's used; otherwise it falls back to the HTTP mirror.
- **Token Saver** — compresses verbose tool output (git diff/grep/ls/tree/logs)
  before it reaches the LLM (−20-40% input tokens, lossless, on by default).
- **Terseness** — Caveman / Ponytail output styles to cut output tokens, per-key or
  via `X-LLMProxy-Terseness` header.
- **Real-time quota** — per-key daily token usage with a live reset countdown.
- **Bilingual panel (pt-BR / en)** with a language switcher in the sidebar.
- **Deploy examples** for Dokploy, EasyPanel, Coolify, Render, Railway, VPS+Traefik
  and VPS+Caddy (`deploy/`), plus a published image on GHCR and screenshots.
- **API reference** in the README (routes, capability slugs, curl examples) and an
  ESLint setup wired into CI.

### Security
- Anti-SSRF validation on the HTTP provider `baseUrl` (blocks metadata/private
  IPv4 & IPv6, mapped/decimal/hex forms).
- Rate-limit on the interactive chat.
- HTTP provider API keys stored encrypted (AES-256-GCM); proxy keys hashed with
  argon2id; session tokens hashed for O(1) lookup.

### Fixed
- Docker image now bundles the pnpm workspace `node_modules` correctly (no more
  `ERR_MODULE_NOT_FOUND`), copies `turbo.json`, and installs OpenSSL for Prisma.
- Empty JSON bodies no longer break routes with `Content-Type: application/json`.
- `@fastify/static` and `brace-expansion` bumped past their advisories.

## [0.1.0] — 2026-07-17

### Added
- Initial MVP: detects local LLM CLIs (Claude Code, Codex, Gemini, Cursor,
  OpenCode, Antigravity, and more) and exposes them as an OpenAI/Anthropic-
  compatible proxy (`/v1/chat/completions`, `/v1/messages`, `/v1/models`).
- Web panel: setup wizard, proxy keys, users & sessions, usage, interactive chat.
- Self-hosted stack (Postgres + Redis) with Docker.

[Unreleased]: https://github.com/BSNSolution/llm-proxy-api/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/BSNSolution/llm-proxy-api/releases/tag/v0.1.0
