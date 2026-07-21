import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  bundle: true,
  splitting: false,
  clean: true,
  outDir: 'dist',
  // Bundla os packages internos do monorepo (consumidos via source TS).
  noExternal: [/^@llm-proxy\//],
  // Deps com binários nativos / que resolvem paths em runtime devem ficar externas.
  external: ['@node-rs/argon2', '@prisma/client', '.prisma', 'ioredis'],
});
