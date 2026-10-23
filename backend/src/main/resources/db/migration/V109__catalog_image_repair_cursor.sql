-- Cursor do reparo agendado de fotos do catálogo (CatalogImageRepairJob).
--
-- O reparo confere no disco se o arquivo de cada enriquecimento com
-- image_storage_key ainda existe e baixa de novo o que sumiu. Não dá para
-- filtrar isso no banco: o critério é o arquivo, não uma coluna. Até aqui o job
-- paginava product_enrichments inteira com OFFSET, carregando a entidade com
-- raw_payload e attributes_json (TOAST), em até 250 mil itens por disparo.
-- Medido em 23/10/2026: ~850 ms por página e ~57 s de banco a cada 60 s.
--
-- Agora cada disparo anda uma janela por chave (product_id > último visto), com
-- teto de itens, e guarda aqui onde parou. Ao chegar ao fim volta do início.
-- Sem market_id: tabela global, só o contêiner de jobs grava (sem RLS).
create table if not exists catalog_image_repair_cursor (
    job_name         varchar(64) primary key,
    last_product_id  uuid,
    pass_started_at  timestamp,
    last_run_at      timestamp,
    last_run_scanned integer     not null default 0,
    updated_at       timestamp   not null default now()
);
