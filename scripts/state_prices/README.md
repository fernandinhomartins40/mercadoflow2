# State Price Scripts

Utilities to normalize and import state price observations into MercadoFlow.

## Automatic sync from public portals

```bash
python scripts/state_prices/sync_state_price_portals.py \
  --import \
  --watch \
  --interval-minutes 360 \
  --api-base http://localhost:8080/api \
  --email admin@mercadoflow.com \
  --password <senha>
```

Supported automatic crawlers today:

- `PRECO_DA_HORA_BA` via JSON search API
- `BUSCA_PRECO_AM` via HTML portal pagination

You can narrow the run with `--provider PRECO_DA_HORA_BA` or `--provider BUSCA_PRECO_AM`.

## Collect from HTML or JSON

```bash
python scripts/state_prices/collect_state_price_records.py \
  --provider MENOR_PRECO_PR \
  --name "Menor Preco Parana" \
  --state-code PR \
  --service-name "Menor Preco / Nota Parana" \
  --service-url "https://menorpreco.notaparana.pr.gov.br/" \
  --url "https://example.com/search-page.html" \
  --output data/state-prices/pr.json
```

## Import directly to the API

```bash
python scripts/state_prices/collect_state_price_records.py \
  --provider MENOR_PRECO_PR \
  --name "Menor Preco Parana" \
  --state-code PR \
  --service-name "Menor Preco / Nota Parana" \
  --service-url "https://menorpreco.notaparana.pr.gov.br/" \
  --input data/state-prices/pr.json \
  --import \
  --api-base http://localhost:8080/api \
  --email admin@mercadoflow.com \
  --password <senha>
```

## Notes

- The generic parser works best with pages that expose `application/ld+json` product blocks or cards with `data-*` attributes.
- `sync_state_price_portals.py` is the runner used for the public state portals that already expose crawlable search endpoints.
- Run it with `--watch` in production so the database stays fresh automatically.
- `providers.json` contains the current registry of official state sources and crawl metadata.
