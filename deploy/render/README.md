# Deploy no Render

Usa um **Blueprint** (`render.yaml`): sobe o app (do Dockerfile) + Postgres +
Key Value (Redis) gerenciados pela Render, com HTTPS automático.

## Passos

1. No Render: **New → Blueprint** → conecte este repositório. Ele detecta
   [`deploy/render/render.yaml`](./render.yaml).
   > Se o Render não achar na subpasta, copie o `render.yaml` para a **raiz** do
   > seu fork (é onde alguns planos esperam o blueprint).
2. Aprove os recursos (web + db + redis). O `SESSION_SECRET` é gerado pela Render;
   o `DATABASE_URL`/`REDIS_URL` são preenchidos automaticamente.
3. Após o 1º deploy, edite o env do serviço `llmproxy` e defina **`PUBLIC_BASE_URL`**
   com a URL final (ex.: `https://llmproxy.onrender.com` ou seu domínio custom).
4. Abra a URL → crie o admin na tela de Setup.

## Notas

- O plano **free** hiberna o serviço quando ocioso — para um proxy sempre-on,
  use ao menos o **starter**. O Postgres/Redis free têm limites de retenção.
- Container não tem CLIs → configure uma **fonte HTTP** em Fontes & Combos.
- Migrations rodam sozinhas no boot (o entrypoint faz `prisma migrate deploy`).
