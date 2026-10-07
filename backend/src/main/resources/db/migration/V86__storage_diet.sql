-- Dieta de espaço (06/10/2026). Nada de dado sai daqui: só como ele é guardado.
--
-- Medido em produção: opportunities com 3,7 MB de dados ocupava 1,9 GB,
-- product_price_daily_stats 20 MB em 431 MB, recommendations 4,7 MB em 220 MB.
-- A causa (regravar sem mudança, apagar e reinserir) foi corrigida no código;
-- isto deixa o Postgres reaproveitar o espaço em vez de crescer.

-- 1. Tabelas atualizadas com frequência: folga na página (a regravação cabe na
--    mesma página, sem tocar índice) e vacuum automático bem mais cedo que os
--    20% padrão.
alter table opportunities set (fillfactor = 75, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table recommendations set (fillfactor = 80, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table product_capital_metrics set (fillfactor = 80, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.05);
alter table product_inventory_estimates set (fillfactor = 80, autovacuum_vacuum_scale_factor = 0.02);
alter table product_metric_history set (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02);
alter table product_price_daily_stats set (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02);
alter table products set (fillfactor = 85, autovacuum_vacuum_scale_factor = 0.02);
alter table product_promotion_windows set (autovacuum_vacuum_scale_factor = 0.05);
alter table product_price_events set (autovacuum_vacuum_scale_factor = 0.05);

-- 2. Índices que repetem exatamente as colunas de um índice único da mesma
--    tabela: o único já atende toda consulta que eles atendiam.
drop index if exists idx_product_price_daily_stats_market_product_date;
drop index if exists idx_metric_history_product;

-- 3. Textos e JSON grandes passam a ser comprimidos com LZ4 (Postgres 14+).
--    Vale para o que for gravado daqui em diante; o que já existe é
--    recomprimido numa manutenção à parte (VACUUM FULL depois de regravar).
alter table product_enrichments alter column raw_payload set compression lz4;
alter table state_price_observations alter column raw_payload set compression lz4;
alter table opportunities alter column evidence set compression lz4;
alter table recommendations alter column parameters set compression lz4;
alter table recommendations alter column evidence set compression lz4;
alter table recommendations alter column calculation_trace set compression lz4;

-- 4. Resumo diário do preço estadual. Observações com mais de 90 dias viram
--    uma linha por fonte, produto, UF e dia; o detalhe vai para um .csv.gz no
--    arquivo morto (StatePriceRetentionJob) e a última observação de cada
--    loja e produto continua na tabela original.
create table if not exists state_price_daily (
    source_id       uuid not null references state_price_sources(id),
    product_id      uuid not null references products(id),
    observed_state  text not null,
    day             date not null,
    min_price       numeric(10,2) not null,
    median_price    numeric(10,2) not null,
    max_price       numeric(10,2) not null,
    avg_price       numeric(10,2) not null,
    observations    integer not null,
    primary key (source_id, product_id, observed_state, day)
);
create index if not exists idx_state_price_daily_product_day on state_price_daily (product_id, day desc);
