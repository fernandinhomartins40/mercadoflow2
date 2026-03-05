# Base Geral de Produtos (Web + NFC-e)

## Fontes publicas integradas no backend

1. Open Food Facts (Brasil)
- API usada: `https://world.openfoodfacts.org/api/v2/search`
- Filtro: `countries_tags=brasil`
- Foco: alimentos e bebidas

2. Open Beauty Facts (Brasil)
- API usada: `https://world.openbeautyfacts.org/api/v2/search`
- Filtro: `countries_tags=brasil`
- Foco: higiene e perfumaria

3. Open Products Facts (Brasil)
- API usada: `https://world.openproductsfacts.org/api/v2/search`
- Filtro: `countries_tags=brasil`
- Foco: utilidades e itens nao alimentares

## Licenca dos dados

- Open*Facts usa ODbL (Open Database License).
- O sistema grava a licenca no enrichment (`source_license`) para rastreabilidade.

## Endpoint para carga web imediata

`POST /api/v1/admin/catalog/import/web`

Parametros:
- `maxPagesPerSource` (padrao `25`)
- `pageSize` (padrao `100`, maximo efetivo `100`)
- `includeBeautyFacts` (padrao `true`)
- `includeOpenProductsFacts` (padrao `true`)

Resultado:
- grava/atualiza `products` (catalogo geral por GTIN)
- grava/atualiza `product_enrichments` por `produto + provider`
- retorna estatisticas por fonte

## Importacao por lote (payload externo)

Novo endpoint:
- `POST /api/v1/admin/catalog/import/records`

Body esperado:
- `provider`
- `sourceLicense`
- `confidenceScore`
- `skipMedication`
- `items[]` com `code`, `name`, `brand`, `category`, `packageDescription`, `rawPayload`

## Coleta no InfoPrice (ISA)

Scripts adicionados:

1. Extracao completa do seletor de produtos:
- `python scripts/catalog/extract_infoprice_products.py --email <email> --password <senha> --output data/catalog/infoprice_products.json`
- Fecha overlays automaticamente, abre o filtro `Produto` e clica em `CARREGAR MAIS` ate nao haver novos itens.
- Salva JSON e CSV.

2. Importacao dos itens extraidos:
- `python scripts/catalog/import_catalog_records.py --input data/catalog/infoprice_products.json --api-base http://localhost:8080/api --email <admin> --password <senha> --provider INFOPRICE_ISA`
- Tenta primeiro o endpoint em lote (`/catalog/import/records`).
- Se o backend ainda estiver sem esse endpoint, faz fallback para `POST /api/v1/admin/catalog/enrichments` item a item.

## Painel admin da base global

Nova pagina (somente ADMIN):
- rota: `/app/admin/catalogo`
- lista paginada de produtos enriquecidos
- filtros por `provider` e busca por nome/GTIN/marca

Endpoint de listagem:
- `GET /api/v1/admin/catalog/products?page=0&size=50&provider=INFOPRICE_ISA&search=...`

## Atualizacao automatica (opcional)

Variaveis de ambiente:
- `CATALOG_WEB_IMPORT_ENABLED=true`
- `CATALOG_WEB_IMPORT_FIXED_DELAY_MS=86400000`
- `CATALOG_WEB_IMPORT_MAX_PAGES=5`
- `CATALOG_WEB_IMPORT_PAGE_SIZE=100`

## Fontes mapeadas para proxima etapa (comercial/restrita)

1. Bluesoft Cosmos
- Catalogo GTIN/NCM/marca com API e planos comerciais

2. GS1 Brasil (CNP / Verified)
- Base oficial para validacao/autenticidade de GTIN
