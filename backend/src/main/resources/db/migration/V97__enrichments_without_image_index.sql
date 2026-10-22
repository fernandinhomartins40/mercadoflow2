-- Fila de busca de foto (CatalogImageLookupService.pending): o coletor pergunta a
-- cada 5 minutos quais produtos estão sem imagem. Medido em 22/10/2026: 2,4 s e
-- 1,5 milhão de páginas lidas por consulta, varrendo os 394 mil enriquecimentos,
-- para achar 667 sem imagem. O índice parcial guarda só esses.
--
-- Sem CONCURRENTLY, como em V39: o Flyway roda na transação e o índice é montado
-- em segundos; só as gravações de enriquecimento esperam durante o deploy.
create index if not exists idx_product_enrichments_without_image
    on product_enrichments (product_id)
    where coalesce(image_storage_key, '') = '';
