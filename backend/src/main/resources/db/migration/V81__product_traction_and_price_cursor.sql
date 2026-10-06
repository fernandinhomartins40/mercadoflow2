-- Auditoria de 06/10/2026 (docs/AUDITORIA-ANALISES.md).

-- ── 1. Tração por produto ───────────────────────────────────────────────────
-- Quanto um produto puxa a venda de outros, medido no cupom: o resto do cupom
-- quando ele está presente comparado com cupons do MESMO número de itens sem
-- ele (controla "compra grande tem mais de tudo"). Só dias com histórico
-- completo entram. Recalculada de madrugada.
create table if not exists product_traction (
    id                    uuid primary key default gen_random_uuid(),
    market_id             uuid not null references markets(id) on delete cascade,
    product_id            uuid not null references products(id) on delete cascade,
    window_days           integer not null,
    complete_days         integer not null,
    baskets               integer not null,          -- cupons com o produto
    total_baskets         integer not null,          -- cupons da janela
    own_revenue           numeric(14,2) not null,
    lift_per_basket       numeric(12,4) not null,    -- R$ a mais no resto do cupom
    lift_total            numeric(14,2) not null,    -- lift_per_basket × baskets
    z_score               numeric(10,4),             -- força estatística do lift
    strong_partners       integer not null default 0,-- parceiros com lift >= 1,5 e >= 5 cupons
    partners              jsonb,                     -- os principais parceiros
    computed_at           timestamp not null default now()
);

create unique index if not exists ux_product_traction_market_product on product_traction (market_id, product_id);
create index if not exists idx_product_traction_rank on product_traction (market_id, lift_total desc);

alter table product_traction enable row level security;
create policy tenant_isolation on product_traction for all using (
    current_setting('app.is_admin', true) = 'true'
    or market_id = nullif(current_setting('app.current_market', true), '')::uuid
);

-- ── 2. Linha do tempo de preço retomável ────────────────────────────────────
-- O job refazia, numa transação só, o histórico de todos os produtos vendidos
-- desde o checkpoint; um deploy no meio jogava tudo fora e o checkpoint ficou
-- parado desde 12/08. Agora o trabalho anda em lotes e guarda onde parou.
alter table price_intelligence_checkpoints
    add column if not exists cursor_product_id uuid,
    add column if not exists target_observed_at timestamp;
