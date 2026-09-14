-- O job de reparo de imagem do catalogo (CatalogImageRepairJob, a cada 6h)
-- pagina product_enrichments ordenando por fetched_at desc. Nao havia indice
-- que atendesse esse ORDER BY: o indice existente e (product_id, fetched_at),
-- que so serve quando ha filtro por product_id.
--
-- Sem indice o Postgres fazia Parallel Seq Scan em 150.639 linhas, com dois
-- workers, para devolver uma pagina de 24 registros. Medido em producao:
--
--   sem indice: Execution Time 2809.887 ms, Buffers shared hit=23156 read=12238
--   com indice: Execution Time    2.719 ms, Buffers shared hit=16    read=10
--
-- Como o loop pagina a tabela inteira, isso mantinha o Postgres entre 126% e
-- 155% de CPU por varios minutos a cada disparo do job.
--
-- Indice parcial com o mesmo predicado da consulta. Hoje 150.492 de 150.639
-- linhas satisfazem o filtro, entao a economia de tamanho e marginal; o
-- predicado esta aqui para que o planner o reconheca como aplicavel a consulta.
CREATE INDEX IF NOT EXISTS idx_pe_fetched_at_com_imagem
    ON product_enrichments (fetched_at DESC)
    WHERE coalesce(image_storage_key, '') <> '';
