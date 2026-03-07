create table if not exists catalog_crawler_checkpoints (
    id uuid primary key,
    provider varchar(64) not null,
    scope_type varchar(64) not null,
    scope_key varchar(512) not null,
    scope_hash varchar(128),
    status varchar(32) not null,
    run_id uuid null,
    item_count integer not null default 0,
    metadata_json text null,
    error_message text null,
    completed_at timestamp null,
    last_seen_at timestamp not null,
    created_at timestamp not null,
    updated_at timestamp not null
);

create unique index if not exists uk_catalog_crawler_checkpoint_scope
    on catalog_crawler_checkpoints(provider, scope_type, scope_key);

create index if not exists idx_catalog_crawler_checkpoint_provider_status
    on catalog_crawler_checkpoints(provider, status, updated_at desc);

create index if not exists idx_catalog_crawler_checkpoint_provider_type_status
    on catalog_crawler_checkpoints(provider, scope_type, status, updated_at desc);
