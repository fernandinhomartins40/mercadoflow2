-- Inteligência de capital de giro e de tração promocional.
--
-- Objetivo do módulo: responder "onde investir o capital de giro" com números
-- da realidade de CADA loja, e não com faixas fixas iguais para todo mundo.
--
-- Três blocos:
--   1. product_inventory_estimates — estoque teórico (compras − vendas) com um
--      score de confiança, já que não existe inventário físico no sistema.
--   2. product_capital_metrics — ABC/XYZ, GMROI, cobertura e classificação de
--      capital, recalculados por job e consumidos pelas telas.
--   3. product_halo_effects — quanto um produto em promoção traciona a venda
--      de outros (cruzamento de cesta com janelas promocionais).
--
-- Todas entram na RLS por tenant, no mesmo padrão de V29.

-- ── 1. Estoque estimado ────────────────────────────────────────────────────
-- Sem inventário físico, o estoque é derivado: entradas registradas (compras
-- via supplier_orders/purchase_price_history) menos saídas (itens vendidos nas
-- notas). É aproximado por construção — daí confidence_score e os campos de
-- rastreio, que permitem à UI dizer quando o número merece confiança.
create table product_inventory_estimates (
    id                     uuid primary key default gen_random_uuid(),
    market_id              uuid not null references markets (id) on delete cascade,
    product_id             uuid not null references products (id) on delete cascade,

    estimated_units        numeric(14,3) not null default 0,
    estimated_cost_value   numeric(14,2) not null default 0,

    total_purchased_units  numeric(14,3) not null default 0,
    total_sold_units       numeric(14,3) not null default 0,

    -- 0..1: cai quando faltam compras registradas ou quando o saldo fica
    -- negativo (sinal de que houve entrada não registrada).
    confidence_score       numeric(5,4)  not null default 0,
    confidence_reason      varchar(64),

    last_purchase_at       timestamp,
    last_sale_at           timestamp,
    computed_at            timestamp not null default now(),

    constraint uq_inventory_estimate_market_product unique (market_id, product_id)
);

create index idx_inventory_estimate_market on product_inventory_estimates (market_id);
create index idx_inventory_estimate_confidence on product_inventory_estimates (market_id, confidence_score desc);

-- ── 2. Métricas de capital por produto ─────────────────────────────────────
-- abc_class  : Pareto de receita (A=80%, B=95%, C=resto) — relativo à loja.
-- xyz_class  : previsibilidade da demanda pelo coeficiente de variação
--              (X=estável, Y=variável, Z=errático) — define o colchão de
--              segurança do ponto de reposição.
-- gmroi      : margem bruta / capital médio investido. É a métrica que responde
--              "cada real parado neste produto me devolve quanto".
-- capital_status: veredito acionável (INVEST / MANTER / REDUZIR / LIQUIDAR).
create table product_capital_metrics (
    id                       uuid primary key default gen_random_uuid(),
    market_id                uuid not null references markets (id) on delete cascade,
    product_id               uuid not null references products (id) on delete cascade,

    window_days              integer not null default 90,

    revenue                  numeric(14,2) not null default 0,
    quantity_sold            numeric(14,3) not null default 0,
    gross_margin_value       numeric(14,2),
    gross_margin_percent     numeric(9,4),

    unit_cost                numeric(14,4),
    unit_price               numeric(14,4),
    cost_source              varchar(24),

    daily_velocity           numeric(14,4) not null default 0,
    demand_cv                numeric(9,4),

    abc_class                char(1),
    xyz_class                char(1),
    revenue_share            numeric(9,6),
    revenue_cumulative_share numeric(9,6),

    inventory_units          numeric(14,3),
    inventory_value          numeric(14,2),
    coverage_days            numeric(10,2),
    gmroi                    numeric(12,4),

    reorder_point_units      numeric(14,3),
    suggested_order_units    numeric(14,3),
    suggested_order_value    numeric(14,2),

    momentum_score           numeric(9,4),
    stagnation_risk          numeric(5,4),
    capital_status           varchar(16),
    capital_reason           text,
    priority_score           numeric(9,4),

    computed_at              timestamp not null default now(),

    constraint uq_capital_metrics_market_product unique (market_id, product_id)
);

create index idx_capital_metrics_market on product_capital_metrics (market_id);
create index idx_capital_metrics_status on product_capital_metrics (market_id, capital_status);
create index idx_capital_metrics_priority on product_capital_metrics (market_id, priority_score desc);
create index idx_capital_metrics_abc on product_capital_metrics (market_id, abc_class, xyz_class);

-- ── 3. Efeito halo (tração cruzada em promoção) ────────────────────────────
-- Mede se, quando o produto "driver" está em promoção, o produto "target"
-- vende mais do que vende normalmente. É a diferença entre uma promoção que
-- só desconta e uma que puxa a cesta inteira.
create table product_halo_effects (
    id                      uuid primary key default gen_random_uuid(),
    market_id               uuid not null references markets (id) on delete cascade,
    driver_product_id       uuid not null references products (id) on delete cascade,
    target_product_id       uuid not null references products (id) on delete cascade,

    -- Velocidade diária do target quando o driver está / não está em promoção.
    target_promo_velocity   numeric(14,4) not null default 0,
    target_normal_velocity  numeric(14,4) not null default 0,
    halo_lift_percent       numeric(10,4),

    -- Receita incremental atribuída ao target durante as promoções do driver.
    incremental_revenue     numeric(14,2),

    co_occurrence_count     integer not null default 0,
    basket_lift             numeric(10,4),
    promo_days_observed     integer not null default 0,
    confidence              numeric(5,4) not null default 0,

    window_days             integer not null default 180,
    computed_at             timestamp not null default now(),

    constraint uq_halo_market_driver_target unique (market_id, driver_product_id, target_product_id)
);

create index idx_halo_market_driver on product_halo_effects (market_id, driver_product_id);
create index idx_halo_lift on product_halo_effects (market_id, halo_lift_percent desc);

-- ── 4. Sazonalidade por produto ────────────────────────────────────────────
-- Índice sazonal por período (dia da semana e mês): 1.0 = venda na média,
-- 1.4 = 40% acima. Alimenta tanto a sugestão de compra quanto a escolha da
-- janela ideal de promoção.
create table product_seasonality (
    id               uuid primary key default gen_random_uuid(),
    market_id        uuid not null references markets (id) on delete cascade,
    product_id       uuid not null references products (id) on delete cascade,

    -- 'DOW' (0-6) ou 'MONTH' (1-12)
    period_type      varchar(8) not null,
    period_index     integer    not null,

    seasonal_index   numeric(9,4) not null default 1,
    observations     integer      not null default 0,
    confidence       numeric(5,4) not null default 0,

    window_days      integer not null default 365,
    computed_at      timestamp not null default now(),

    constraint uq_seasonality_market_product_period
        unique (market_id, product_id, period_type, period_index)
);

create index idx_seasonality_market_product on product_seasonality (market_id, product_id);

-- ── RLS: mesmo padrão das demais tabelas por tenant (ver V29) ──────────────
do $$
declare
    tenant_table text;
    tenant_tables text[] := array[
        'product_inventory_estimates',
        'product_capital_metrics',
        'product_halo_effects',
        'product_seasonality'
    ];
begin
    foreach tenant_table in array tenant_tables loop
        execute format('alter table %I enable row level security', tenant_table);
        execute format(
            'create policy tenant_isolation on %I for all using ('
            || ' current_setting(''app.is_admin'', true) = ''true'''
            || ' or market_id = nullif(current_setting(''app.current_market'', true), '''')::uuid'
            || ')',
            tenant_table
        );
    end loop;
end $$;
