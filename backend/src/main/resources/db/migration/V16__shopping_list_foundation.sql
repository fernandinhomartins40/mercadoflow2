create table shopping_list_items (
    id uuid primary key,
    market_id uuid not null references markets(id) on delete cascade,
    product_id uuid not null references products(id) on delete cascade,
    quantity_target numeric(14,3) not null default 1,
    note varchar(1000),
    source_tag varchar(100) not null default 'MANUAL',
    reason_summary varchar(1000),
    is_checked boolean not null default false,
    created_at timestamp,
    updated_at timestamp
);

create unique index ux_shopping_list_market_product
    on shopping_list_items (market_id, product_id);

create index idx_shopping_list_market_checked
    on shopping_list_items (market_id, is_checked, updated_at desc);
