-- Decisões com preço e custo informados (docs/PROPOSTA-DECISOES-E-INTEGRACAO.md, fase 1).
-- O que o lojista (ou o ERP dele) informa vira dado e não precisa ser digitado de novo.

-- ── 1. De onde veio cada custo ──────────────────────────────────────────────
-- PURCHASE: recebimento de pedido | MANUAL: lojista informou numa decisão |
-- ERP: enviado pelo ERP integrado | ERP_RECEIPT: entrada de mercadoria do ERP.
-- Custo informado sem compra entra com quantity_purchased = 0 (não mexe no estoque).
alter table purchase_price_history
    add column if not exists source varchar(20) not null default 'PURCHASE';

-- ── 2. Contagem de estoque ──────────────────────────────────────────────────
-- Ponto de partida do estoque: contagem + entradas depois dela − vendas depois
-- dela. Sem nenhuma contagem nem compra, o estoque segue desconhecido.
create table if not exists stock_counts (
    id          uuid primary key default gen_random_uuid(),
    market_id   uuid not null references markets(id) on delete cascade,
    product_id  uuid not null references products(id) on delete cascade,
    units       numeric(14,3) not null,
    counted_at  timestamp not null default now(),
    source      varchar(20) not null default 'MANUAL',   -- MANUAL | ERP
    created_by  varchar(200)
);
create index if not exists idx_stock_counts_latest on stock_counts (market_id, product_id, counted_at desc);

alter table stock_counts enable row level security;
create policy tenant_isolation on stock_counts for all using (
    current_setting('app.is_admin', true) = 'true'
    or market_id = nullif(current_setting('app.current_market', true), '')::uuid
);

-- ── 3. Preço de venda oficial ───────────────────────────────────────────────
-- O preço que a loja pratica (do ERP ou informado), incluindo a promoção com
-- vigência. A análise de promoção passa a medir contra o preço oficial em vez
-- do preço inferido das notas.
create table if not exists product_price_list (
    market_id    uuid not null references markets(id) on delete cascade,
    product_id   uuid not null references products(id) on delete cascade,
    price        numeric(14,4),
    promo_price  numeric(14,4),
    promo_start  date,
    promo_end    date,
    source       varchar(20) not null default 'MANUAL',  -- MANUAL | ERP
    updated_at   timestamp not null default now(),
    primary key (market_id, product_id)
);

alter table product_price_list enable row level security;
create policy tenant_isolation on product_price_list for all using (
    current_setting('app.is_admin', true) = 'true'
    or market_id = nullif(current_setting('app.current_market', true), '')::uuid
);
