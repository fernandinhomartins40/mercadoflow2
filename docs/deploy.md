# Deploy

## Docker
1. Ajuste `docker-compose.yml` e `nginx.conf` com dominios e certificados.
2. Build do frontend: `./scripts/build-frontend.ps1`
3. Atualize os containers com `./scripts/deploy.ps1`

## Regra operacional
- O deploy deve atualizar containers com `docker compose up -d --build --force-recreate --remove-orphans`.
- Nao use `docker compose down -v`, `docker volume rm` ou limpezas agressivas de volumes no fluxo padrao.
- Volumes do banco devem ser preservados entre releases.
- Em producao, o workflow usa `deploy/deploy-web.sh`, que valida compose, faz backup logico do PostgreSQL e atualiza a aplicacao sem destruir volumes.

## Variaveis de ambiente
- `DATABASE_URL` (Postgres)
- `DATABASE_USER`
- `DATABASE_PASSWORD`
- `JWT_SECRET` (obrigatorio em producao)
- `JWT_EXPIRATION_MS`
- `CORS_ALLOWED_ORIGINS`
- `AUTH_COOKIE_SAMESITE` (recomendado None em producao)
- `INSTALLER_DIR` (diretorio com `PDV2Cloud-Setup.exe` para download)
- `APP_PUBLIC_BASE_URL` (URL publica usada em QR code/setup do agente)
- `JOBS_ENABLED` (padrao `false`; no profile `jobs` ja fica `true`)

## Certificados
Coloque `fullchain.pem` e `privkey.pem` em `./certs/`.
