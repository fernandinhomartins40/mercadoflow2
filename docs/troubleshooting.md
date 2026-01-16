# Troubleshooting

## API nao sobe
- Verifique `DATABASE_URL` e permissoes de escrita no volume.
- Rode `mvn -q -DskipTests package` para validar build.

## Agente nao envia XML
- Verifique `api_url`, `api_token` e `market_id` no config.
- Confira `C:/ProgramData/PDV2Cloud/logs/agent.log`.
- Teste `scripts/healthcheck.ps1`.
- Garanta que os XSDs foram baixados em `C:/ProgramData/PDV2Cloud/xsd`.
- Se houver erro de XMLDSig, instale as dependencias do `xmlsec` no Windows.

## Erro de assinatura HMAC
- Certifique que `HMAC_SECRET` no backend e no agente sao iguais.

## Frontend sem login
- Garanta que `CORS_ALLOWED_ORIGINS` inclua o dominio da UI.
- Verifique cookie httpOnly no navegador.
