# Imagem unica dos tres coletores (catalog-harvester, barcode-enricher,
# state-price-sync).
#
# Antes cada container rodava `pip install requests pillow` dentro do `command`,
# ou seja, A CADA RESTART: baixava os pacotes da rede antes de comecar a
# trabalhar. Com as dependencias na imagem, o restart e imediato e nao depende
# do PyPI estar no ar.
FROM python:3.11-slim

# requests: chamadas HTTP a API e aos portais
# pillow: usada por scripts/catalog/optimized_image_store.py
# beautifulsoup4: usada por scripts/state_prices/sync_state_price_portals.py
RUN pip install --no-cache-dir \
      requests>=2.31.0 \
      pillow \
      beautifulsoup4>=4.12.0

WORKDIR /workspace
