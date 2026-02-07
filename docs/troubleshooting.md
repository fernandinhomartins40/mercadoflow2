# Troubleshooting

## API nao sobe
- Verifique Postgres (`docker compose ps`) e variaveis `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD`.
- Veja logs: `docker compose logs -f api`
- Para validar build: `./scripts/build-backend.ps1` (usa Maven local ou Docker se nao tiver Maven)

## Agente nao envia XML
- Verifique `api_url` e `api_key` no config (`market_id` e opcional e pode ser preenchido via API).
- Confira `C:/ProgramData/PDV2Cloud/logs/agent.log`.
- Teste `scripts/healthcheck.ps1`.
- Garanta que os XSDs foram baixados em `C:/ProgramData/PDV2Cloud/xsd`.
- Se houver erro de XMLDSig, instale as dependencias do `xmlsec` no Windows (sem `xmlsec` a validacao de assinatura e ignorada).

## Erro de assinatura HMAC
- O segredo e a propria `api_key` (header `X-API-Key`).
- A `X-Signature` precisa ser o HMAC do body exatamente como enviado (bytes).

## Frontend sem login
- Garanta que `CORS_ALLOWED_ORIGINS` inclua o dominio da UI.
- Verifique cookie httpOnly no navegador.
