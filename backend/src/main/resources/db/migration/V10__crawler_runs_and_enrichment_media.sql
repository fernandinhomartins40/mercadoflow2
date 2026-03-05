alter table products add column if not exists image_url text;

alter table product_enrichments add column if not exists image_url text;
alter table product_enrichments add column if not exists image_storage_key text;
alter table product_enrichments add column if not exists description text;
alter table product_enrichments add column if not exists manufacturer text;
alter table product_enrichments add column if not exists attributes_json text;

create table if not exists catalog_crawler_runs (
    id uuid primary key,
    requested_at timestamp not null default now(),
    started_at timestamp,
    finished_at timestamp,
    status text not null,
    scanned_products integer not null default 0,
    imported_products integer not null default 0,
    skipped_invalid_gtin integer not null default 0,
    skipped_missing_name integer not null default 0,
    skipped_medication integer not null default 0,
    skipped_duplicate_gtin integer not null default 0,
    errors integer not null default 0,
    message text,
    triggered_by text,
    sources_json text,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
);

create index if not exists idx_catalog_crawler_runs_requested_at on catalog_crawler_runs(requested_at desc);
