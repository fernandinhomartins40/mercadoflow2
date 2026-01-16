# Deploy

## Docker
1. Ajuste `docker-compose.yml` e `nginx.conf` com dominios e certificados.
2. Build do frontend: `./scripts/build-frontend.ps1`
3. Suba os containers: `./scripts/deploy.ps1`

## Variaveis de ambiente
- `DATABASE_URL` (SQLite ou Postgres)
- `JWT_SECRET`
- `JWT_EXPIRATION_MS`
- `HMAC_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `AUTH_COOKIE_SAMESITE` (recomendado None em producao)

## Certificados
Coloque `fullchain.pem` e `privkey.pem` em `./certs/`.
