# Deploy no Railway

O Railway builda do Dockerfile e você adiciona Postgres + Redis como serviços do
projeto. Não usa docker-compose — cada serviço é separado e você conecta as vars.

## Passos

1. No Railway: **New Project → Deploy from GitHub repo** → este repositório.
   O [`railway.json`](./railway.json) define o build (Dockerfile) e o health check.
   > Se colocado na subpasta não for detectado, copie `railway.json` para a **raiz**
   > do seu fork.
2. No mesmo projeto: **New → Database → Add PostgreSQL** e **Add Redis**.
3. No serviço do app, aba **Variables**, defina:
   ```
   NODE_ENV=production
   API_HOST=0.0.0.0
   API_PORT=8787
   # referencie os plugins (o Railway expõe estas como variáveis do projeto):
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   SESSION_SECRET=<64+ chars aleatórios>
   PUBLIC_BASE_URL=https://<seu-app>.up.railway.app
   ```
4. Em **Settings → Networking**, gere um domínio (ou aponte um custom) na porta `8787`.
5. Abra a URL → crie o admin na tela de Setup.

## Notas

- As migrations rodam sozinhas no boot (o entrypoint faz `prisma migrate deploy`).
- Container não tem CLIs → configure uma **fonte HTTP** em Fontes & Combos.
- Ajuste `DATABASE_URL`/`REDIS_URL` conforme os nomes exatos dos plugins no seu
  projeto (o Railway mostra as variáveis disponíveis com autocomplete `${{ }}`).
