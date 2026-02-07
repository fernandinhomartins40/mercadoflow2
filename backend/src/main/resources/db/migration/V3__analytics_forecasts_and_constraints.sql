-- Ensure daily analytics is idempotent and enable new analytics artifacts.

drop index if exists idx_market_product_date;
create unique index if not exists uq_sales_analytics_market_product_date
    on sales_analytics(market_id, product_id, date);

create table if not exists demand_forecasts (
    id uuid primary key,
    market_id uuid not null,
    product_id uuid not null,
    forecast_date date not null,
    predicted_quantity numeric,
    created_at timestamp,
    foreign key (market_id) references markets(id),
    foreign key (product_id) references products(id)
);

create unique index if not exists uq_demand_forecast_market_product_date
    on demand_forecasts(market_id, product_id, forecast_date);
create index if not exists idx_demand_forecast_market_date
    on demand_forecasts(market_id, forecast_date);

create table if not exists market_basket_rules (
    id uuid primary key,
    market_id uuid not null,
    computed_at timestamp not null,
    antecedent text not null,
    consequent text not null,
    support numeric,
    confidence numeric,
    lift numeric,
    foreign key (market_id) references markets(id)
);

create index if not exists idx_market_basket_rules_market_computed
    on market_basket_rules(market_id, computed_at);

