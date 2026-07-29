// ESLint flat config (raiz do monorepo). Config pragmática: pega erros reais de
// JS/TS sem type-checking pesado (rápido no CI), sem regras estilísticas ruidosas
// — o Prettier cuida de formatação e o tsc/tsc -b cuida de tipos.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/prisma/generated/**',
      'packages/db/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        // Node + browser essentials usados no monorepo (api + web).
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        ReadableStream: 'readonly',
        Response: 'readonly',
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
      },
    },
    rules: {
      // O código usa `any` deliberadamente em fronteiras (parse de SSE de terceiros,
      // payloads de dialeto externo). O tsc estrito já cobre o resto.
      '@typescript-eslint/no-explicit-any': 'off',
      // `_req`, `_` etc. são intencionais.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Regra nova do ESLint 9 com falsos-positivos conhecidos (aponta const
      // legitimamente usado). Desligada — o tsc já cobre variáveis mortas de fato.
      'no-useless-assignment': 'off',
    },
  },
);
