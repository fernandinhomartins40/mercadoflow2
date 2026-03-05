create table if not exists catalog_crawler_configs (
    id uuid primary key,
    user_agent text not null,
    interval_minutes integer not null default 360,
    is_enabled boolean not null default true,
    updated_at timestamp not null default now()
);

create table if not exists catalog_crawler_sources (
    id uuid primary key,
    name text not null,
    provider text not null unique,
    source_license text,
    seeds_json text not null,
    allowed_domains_json text not null,
    product_path_hints_json text not null,
    max_pages integer not null default 250,
    max_records integer not null default 2500,
    rate_limit_ms integer not null default 1000,
    request_timeout_sec integer not null default 20,
    is_enabled boolean not null default true,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
);

create index if not exists idx_catalog_crawler_sources_enabled on catalog_crawler_sources(is_enabled);
