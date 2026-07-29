# Deploy no EasyPanel

## Passos

1. No EasyPanel: **Create Project** → **Add Service → Compose**.
2. Cole o conteúdo de [`docker-compose.yml`](./docker-compose.yml) (ou aponte para
   o repositório com este caminho).
3. **Environment** — defina no mínimo:
   ```
   POSTGRES_PASSWORD=<senha-forte>
   SESSION_SECRET=<64+ chars aleatórios>
   PUBLIC_BASE_URL=https://llm.seudominio.com
   ```
   (o compose usa `${VAR:?...}` para falhar cedo e claro se faltar algo essencial.)
4. **Domains** (no serviço `llmp-app`): adicione `llm.seudominio.com`, porta
   **`8787`**, HTTPS ligado. Aponte o DNS para o servidor.
5. **Deploy**. Abra a URL → crie o admin na tela de Setup.

## Notas

- O `build.context` é `../..` (raiz do repo) porque o Dockerfile está lá. Se colar
  o compose "solto" no EasyPanel, prefira a linha `image: ghcr.io/bsnsolution/llm-proxy-api:latest`
  (comentada no arquivo) em vez do `build:`.
- Container não tem CLIs → configure uma **fonte HTTP** em Fontes & Combos.
