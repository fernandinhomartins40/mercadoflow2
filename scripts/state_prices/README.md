# State Price Scripts

Utilities to normalize and import state price observations into MercadoFlow.

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

- The parser is generic and works best with pages that expose `application/ld+json` product blocks or cards with `data-*` attributes.
- Provider-specific URL templates can be passed with `--url-template`.
- `providers.json` contains the current registry of official state sources.
