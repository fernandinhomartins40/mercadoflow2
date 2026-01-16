# API

## Autenticacao
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

O token JWT e retornado no corpo e setado como cookie httpOnly `pdv2cloud_token`.
Para o frontend web, use somente o cookie httpOnly via `withCredentials`.

## Ingestao
- `POST /api/v1/ingest/invoice`
- `POST /api/v1/ingest/batch`

Headers obrigatorios:
- `Authorization: Bearer <token>`
- `X-Market-ID: <uuid>`
- `X-Agent-Version: 1.0.0`
- `X-Signature: <hmac_sha256>`

## Mercado
- `GET /api/v1/markets/{id}/dashboard`
- `GET /api/v1/markets/{id}/products`
- `GET /api/v1/markets/{id}/alerts`
- `GET /api/v1/markets/{id}/analytics/top-sellers`
- `GET /api/v1/markets/{id}/analytics/market-basket`

## Swagger
`/swagger-ui/index.html`
