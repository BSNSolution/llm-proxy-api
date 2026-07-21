# Contributing to LLM Proxy API

Thanks for your interest in contributing! This document explains how to set up the
project and the conventions we follow.

## Development setup

Requirements: **Node.js 22+**, **pnpm**, **Docker** (for Postgres + Redis).

```bash
pnpm install
cp .env.example .env
pnpm docker:dev      # Postgres + Redis
pnpm db:migrate
pnpm dev             # api + web
```

On first run the app asks you to create an admin account.

## Project layout

```
apps/web        React + Vite panel
apps/api        Fastify — /v1 proxy (OpenAI/Anthropic) + /api management
packages/cli-engine  CLI detection, per-CLI adapters, process pool, setup
packages/db     Prisma schema + migrations
packages/config, crypto, shared-types
infra/          docker compose (dev), boot service
```

## Before you open a PR

Run the full checks locally — CI runs the same:

```bash
pnpm typecheck     # tsc across all packages (must be clean)
pnpm build         # strict build (tsup + vite)
pnpm lint          # if configured
```

Guidelines:

- **TypeScript everywhere.** Keep types honest; avoid `any`.
- Match the surrounding code style (comment density, naming, idioms).
- Keep PRs **focused** — one concern per PR.
- For a new CLI adapter, add it under `packages/cli-engine/src/adapters/`, register it,
  and document the headless command it uses (source it from official docs).
- Don't commit secrets, personal data, or environment-specific values. Config comes
  from env / the UI, never hardcoded.
- Add or update docs when behavior changes.

## Commit / PR messages

- Write clear, descriptive messages (imperative mood: "add", "fix", "refactor").
- Reference related issues (`Fixes #123`).

## Reporting bugs / requesting features

Use the GitHub issue templates. Include steps to reproduce, expected vs. actual
behavior, and your environment (OS, Node version, which CLIs).

## Code of Conduct

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
