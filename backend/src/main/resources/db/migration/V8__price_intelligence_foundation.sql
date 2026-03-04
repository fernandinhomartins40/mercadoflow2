alter table invoice_items add column if not exists valor_desconto numeric(10,2);
alter table invoice_items add column if not exists valor_frete numeric(10,2);
alter table invoice_items add column if not exists valor_outros numeric(10,2);
alter table invoice_items add column if not exists valor_liquido numeric(10,2);

update invoice_items
set valor_liquido = coalesce(valor_total, 0)
where valor_liquido is null;

alter table product_observations add column if not exists discount_amount numeric(10,2);
alter table product_observations add column if not exists freight_amount numeric(10,2);
alter table product_observations add column if not exists other_amount numeric(10,2);
alter table product_observations add column if not exists net_unit_price numeric(10,2);
alter table product_observations add column if not exists net_total_price numeric(10,2);

update product_observations
set net_total_price = coalesce(total_price, 0)
where net_total_price is null;

update product_observations
set net_unit_price = case
    when coalesce(quantity, 0) > 0 then round(net_total_price / quantity, 2)
    else unit_price
end
where net_unit_price is null;

create table if not exists product_price_daily_stats (
    id uuid primary key,
    market_id uuid not null references markets(id),
    product_id uuid not null references products(id),
    stat_date date not null,
    weighted_avg_price numeric(10,2) not null,
    median_price numeric(10,2) not null,
    min_price numeric(10,2) not null,
    max_price numeric(10,2) not null,
    std_dev_price numeric(10,4),
    mad_price numeric(10,4),
    total_quantity numeric(12,3) not null,
    total_revenue numeric(12,2) not null,
    transaction_count integer not null,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
);

create unique index if not exists uq_product_price_daily_stats_market_product_date
    on product_price_daily_stats(market_id, product_id, stat_date);

create index if not exists idx_product_price_daily_stats_market_product_date
    on product_price_daily_stats(market_id, product_id, stat_date desc);

create table if not exists product_price_events (
    id uuid primary key,
    market_id uuid not null references markets(id),
    product_id uuid not null references products(id),
    event_at timestamp not null,
    old_price numeric(10,2) not null,
    new_price numeric(10,2) not null,
    delta_amount numeric(10,2) not null,
    delta_percent numeric(9,4) not null,
    direction text not null,
    baseline_price numeric(10,2) not null,
    dynamic_threshold_percent numeric(9,4) not null,
    confidence_score numeric(5,4) not null,
    trigger_type text not null,
    created_at timestamp not null default now()
);

create index if not exists idx_product_price_events_market_product_event
    on product_price_events(market_id, product_id, event_at desc);

create table if not exists product_promotion_windows (
    id uuid primary key,
    market_id uuid not null references markets(id),
    product_id uuid not null references products(id),
    start_at timestamp not null,
    end_at timestamp,
    baseline_price numeric(10,2) not null,
    promo_price numeric(10,2) not null,
    discount_percent numeric(9,4) not null,
    quantity_lift_percent numeric(9,4) not null,
    revenue_lift_percent numeric(9,4) not null,
    dynamic_threshold_percent numeric(9,4) not null,
    confidence_score numeric(5,4) not null,
    status text not null,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
);

create index if not exists idx_product_promotion_windows_market_product_start
    on product_promotion_windows(market_id, product_id, start_at desc);

create table if not exists price_intelligence_checkpoints (
    market_id uuid primary key references markets(id),
    last_observed_at timestamp,
    updated_at timestamp not null default now()
);

create index if not exists idx_product_observation_market_product_observed
    on product_observations(market_id, product_id, observed_at desc);
