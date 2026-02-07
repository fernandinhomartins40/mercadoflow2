# API

## Autenticacao
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

O token JWT e retornado no corpo e setado como cookie httpOnly `pdv2cloud_token`.
Para o frontend web, use somente o cookie httpOnly via `withCredentials`.

## Chaves do agente
- `POST /api/v1/agent-keys` (roles: MARKET_OWNER, MARKET_MANAGER, ADMIN)
- `GET /api/v1/agent-keys` (roles: MARKET_OWNER, MARKET_MANAGER, ADMIN)

Ao criar, a API retorna a `apiKey` completa uma unica vez. Guarde em local seguro.

## Agente
- `GET /api/v1/agent/me` (header `X-API-Key`)

## Ingestao (somente AGENTE)
- `POST /api/v1/ingest/invoice` (header `X-API-Key`)
- `POST /api/v1/ingest/batch` (header `X-API-Key`)

Headers obrigatorios:
- `Content-Type: application/json`
- `X-API-Key: <api_key>`
- `X-Agent-Version: 1.0.0`
- `X-Signature: <hmac_sha256>`

Header opcional (compatibilidade):
- `X-Market-ID: <uuid>` (se enviado, deve bater com o mercado da `X-API-Key`)

Assinatura:
- `X-Signature` = `HMAC-SHA256(body_bytes, secret=api_key)` em hex (lowercase)
- Assine exatamente os bytes enviados no body (nao assine um JSON "parecido")

## Mercado
- `GET /api/v1/markets/{id}/dashboard`
- `GET /api/v1/markets/{id}/products`
- `GET /api/v1/markets/{id}/alerts`
- `POST /api/v1/markets/{id}/alerts/{alertId}/read`
- `POST /api/v1/markets/{id}/alerts/read-all`
- `GET /api/v1/markets/{id}/analytics/top-sellers`
- `GET /api/v1/markets/{id}/analytics/market-basket`
- `GET /api/v1/markets/{id}/analytics/market-basket/cached`
- `GET /api/v1/markets/{id}/analytics/demand-forecast?days=7`
- `GET /api/v1/markets/{id}/pdvs`
- `POST /api/v1/markets/{id}/pdvs`
- `GET /api/v1/markets/{id}/campaigns`
- `POST /api/v1/markets/{id}/campaigns`

## Swagger
`/swagger-ui/index.html`
