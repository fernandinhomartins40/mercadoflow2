-- Banco de imagens genéricas para o encarte: fotos recortadas (sem fundo) de
-- hortifrúti, açougue, peixaria, padaria e frios — o que não tem código de barras
-- de fabricante e por isso nunca ganha foto pelo catálogo. As imagens são geradas
-- fora da VPS (scripts/catalog/generic_library_build.py) e ficam em
-- data/catalog/images/library/; esta tabela é só o índice de busca.
create table if not exists generic_images (
    id           uuid primary key default gen_random_uuid(),
    name         text not null,
    -- hortifruti | carnes | padaria | frios | outros
    group_name   varchar(20) not null,
    category     text,
    -- Nome + categoria em minúsculas e sem acento, para a busca por palavras.
    search_text  text not null,
    storage_key  text not null unique,
    source_store text,
    width        int,
    height       int,
    created_at   timestamp not null default now()
);
create index if not exists idx_generic_images_group on generic_images (group_name, name);
