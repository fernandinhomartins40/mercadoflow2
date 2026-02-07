# Deploy

## Docker
1. Ajuste `docker-compose.yml` e `nginx.conf` com dominios e certificados.
2. Build do frontend: `./scripts/build-frontend.ps1`
3. Suba os containers: `./scripts/deploy.ps1`

## Variaveis de ambiente
- `DATABASE_URL` (Postgres)
- `DATABASE_USER`
- `DATABASE_PASSWORD`
- `JWT_SECRET` (obrigatorio em producao)
- `JWT_EXPIRATION_MS`
- `CORS_ALLOWED_ORIGINS`
- `AUTH_COOKIE_SAMESITE` (recomendado None em producao)
- `INSTALLER_DIR` (diretorio com `PDV2Cloud-Setup.exe` para download)
- `JOBS_ENABLED` (padrao `false`; no profile `jobs` ja fica `true`)

## Certificados
Coloque `fullchain.pem` e `privkey.pem` em `./certs/`.
