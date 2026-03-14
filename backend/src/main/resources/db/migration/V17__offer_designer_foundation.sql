create table if not exists offer_templates (
    id uuid primary key,
    market_id uuid not null references markets(id) on delete cascade,
    template_key varchar(120),
    name varchar(255) not null,
    description varchar(2000),
    channel varchar(80) not null,
    canvas_width integer not null,
    canvas_height integer not null,
    design_json text not null,
    preview_image_url varchar(2000),
    is_active boolean not null default true,
    is_system_template boolean not null default false,
    created_at timestamp,
    updated_at timestamp
);

create unique index if not exists uk_offer_templates_market_key
    on offer_templates(market_id, template_key);

create index if not exists idx_offer_templates_market
    on offer_templates(market_id);

create table if not exists offer_generation_jobs (
    id uuid primary key,
    market_id uuid not null references markets(id) on delete cascade,
    template_id uuid references offer_templates(id) on delete set null,
    template_name varchar(255) not null,
    name varchar(255) not null,
    status varchar(80) not null,
    output_type varchar(80) not null,
    generation_mode varchar(80) not null,
    product_count integer not null default 0,
    page_count integer not null default 0,
    template_snapshot_json text not null,
    created_at timestamp,
    updated_at timestamp
);

create index if not exists idx_offer_generation_jobs_market
    on offer_generation_jobs(market_id, created_at desc);

create index if not exists idx_offer_generation_jobs_status
    on offer_generation_jobs(market_id, status);

create table if not exists offer_generation_job_items (
    id uuid primary key,
    job_id uuid not null references offer_generation_jobs(id) on delete cascade,
    product_id uuid references products(id) on delete set null,
    position_index integer not null,
    product_name varchar(500) not null,
    product_image_url varchar(2000),
    product_unit varchar(255),
    current_price numeric(14, 2),
    status varchar(80) not null,
    binding_json text not null,
    created_at timestamp
);

create index if not exists idx_offer_generation_job_items_job
    on offer_generation_job_items(job_id, position_index);

