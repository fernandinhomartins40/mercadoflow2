-- Preço da vizinhança (07/10/2026): preço dos produtos da loja nas lojas
-- próximas, pelo código de barras, no Menor Preço do Nota Paraná. Só o Paraná
-- tem portal estadual aberto com busca por GTIN e localização; fora dele a
-- função fica desligada (docs no chat de 07/10/2026).

-- 1. Coordenadas da loja: marcadas pelo dono (GPS do navegador) ou, na falta,
--    o centro do município (resources/geo/municipios-pr.csv).
alter table market_locations add column if not exists latitude numeric(9,6);
alter table market_locations add column if not exists longitude numeric(9,6);
alter table market_locations add column if not exists geo_source varchar(12);

-- 2. Um resumo por produto e coleta. Nada de observação bruta: os preços que
--    passam pela limpeza viram mediana, faixa típica e o mais barato.
create table if not exists local_price_snapshots (
    market_id         uuid not null references markets(id) on delete cascade,
    product_id        uuid not null references products(id) on delete cascade,
    collected_on      date not null,
    provider          varchar(20) not null default 'MENOR_PRECO_PR',
    status            varchar(12) not null,              -- OK | POUCAS_LOJAS | SEM_DADOS
    radius_km         integer not null,
    stores            integer not null default 0,
    discarded         integer not null default 0,
    median_price      numeric(10,2),
    p25_price         numeric(10,2),
    p75_price         numeric(10,2),
    min_price         numeric(10,2),
    min_store         varchar(160),
    min_distance_km   numeric(6,2),
    own_price         numeric(10,2),
    newest_seen       date,
    primary key (market_id, product_id, collected_on)
);
create index if not exists idx_local_price_latest on local_price_snapshots (market_id, product_id, collected_on desc);

alter table local_price_snapshots enable row level security;
create policy tenant_isolation on local_price_snapshots for all using (
    current_setting('app.is_admin', true) = 'true'
    or market_id = nullif(current_setting('app.current_market', true), '')::uuid
);

-- 3. Limpeza da coleta antiga (Busca Preço AM, por palavra-chave e sem GTIN):
--    feita uma vez pelo LegacyStatePriceCleanup, que arquiva antes de apagar.
create table if not exists maintenance_runs (
    name        varchar(80) primary key,
    finished_at timestamp not null default now(),
    summary     text
);
