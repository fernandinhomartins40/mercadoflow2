-- F2 do plano de experiência: o placar do capital no Início ("Seu dinheiro
-- na loja"). Uma foto por loja e dia, para mostrar a evolução desde que a
-- loja entrou. Pequena: uma linha por loja por dia.
create table if not exists store_capital_daily (
    market_id               uuid not null references markets(id) on delete cascade,
    day                     date not null,
    stock_value             numeric(14,2),
    stock_measured_share    numeric(5,4),
    days_of_stock           numeric(8,1),
    revenue_30d             numeric(14,2),
    margin_30d              numeric(14,2),
    margin_percent          numeric(6,2),
    margin_measured_share   numeric(5,4),
    idle_value              numeric(14,2),
    idle_products           integer,
    computed_at             timestamp not null default now(),
    primary key (market_id, day)
);

alter table store_capital_daily enable row level security;
create policy tenant_isolation on store_capital_daily for all using (
    current_setting('app.is_admin', true) = 'true'
    or market_id = nullif(current_setting('app.current_market', true), '')::uuid
);
