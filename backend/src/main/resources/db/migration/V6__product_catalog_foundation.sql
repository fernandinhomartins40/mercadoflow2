alter table products add column if not exists normalized_name text;
alter table products add column if not exists package_description text;
alter table products add column if not exists source_best text not null default 'INVOICE';
alter table products add column if not exists identity_type text not null default 'GTIN';
alter table products add column if not exists confidence_score numeric(5,2) not null default 0;
alter table products add column if not exists observation_count integer not null default 0;
alter table products add column if not exists first_seen_at timestamp;
alter table products add column if not exists last_seen_at timestamp;
alter table products add column if not exists last_verified_at timestamp;

update products
set normalized_name = lower(trim(name))
where normalized_name is null and name is not null;

update products
set identity_type = case
    when ean like 'INT:%' then 'MARKET_INTERNAL'
    when ean like 'DESC:%' then 'MARKET_DESCRIPTION'
    else 'GTIN'
end
where identity_type is null or identity_type = '';

update products
set first_seen_at = coalesce(first_seen_at, created_at),
    last_seen_at = coalesce(last_seen_at, created_at),
    source_best = coalesce(nullif(source_best, ''), 'INVOICE'),
    confidence_score = coalesce(confidence_score, 0),
    observation_count = coalesce(observation_count, 0);

create table if not exists product_observations (
    id uuid primary key,
    product_id uuid not null references products(id),
    market_id uuid not null references markets(id),
    invoice_id uuid not null references invoices(id),
    invoice_item_id uuid not null unique references invoice_items(id),
    observed_gtin text,
    local_name text not null,
    normalized_name text not null,
    internal_code text,
    quantity numeric(10,3),
    unit_price numeric(10,2),
    total_price numeric(10,2),
    source_type text not null,
    observed_at timestamp not null,
    created_at timestamp not null default now()
);

create table if not exists market_product_aliases (
    id uuid primary key,
    market_id uuid not null references markets(id),
    product_id uuid not null references products(id),
    local_name text not null,
    normalized_name text not null,
    internal_code text,
    times_seen integer not null default 0,
    first_seen_at timestamp not null,
    last_seen_at timestamp not null
);

create unique index if not exists uk_market_product_alias_name
    on market_product_aliases(market_id, product_id, normalized_name);

create table if not exists product_enrichments (
    id uuid primary key,
    product_id uuid not null references products(id),
    provider text not null,
    provider_product_id text,
    canonical_name text,
    brand text,
    category text,
    ncm text,
    unit text,
    package_description text,
    raw_payload text,
    source_license text,
    confidence_score numeric(5,2),
    fetched_at timestamp not null,
    last_verified_at timestamp
);

create index if not exists idx_product_observation_product on product_observations(product_id, observed_at desc);
create index if not exists idx_product_observation_market on product_observations(market_id, observed_at desc);
create index if not exists idx_market_product_alias_product on market_product_aliases(product_id, market_id);
create index if not exists idx_product_enrichment_product on product_enrichments(product_id, fetched_at desc);
