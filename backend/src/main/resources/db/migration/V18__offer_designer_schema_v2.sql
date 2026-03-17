create table if not exists offer_brand_kits (
    id uuid primary key,
    market_id uuid not null references markets(id) on delete cascade,
    kit_key varchar(120),
    name varchar(255) not null,
    description varchar(2000),
    tokens_json text not null,
    assets_json text not null,
    is_active boolean not null default true,
    is_system_kit boolean not null default false,
    created_at timestamp,
    updated_at timestamp
);

create unique index if not exists uk_offer_brand_kits_market_key
    on offer_brand_kits(market_id, kit_key);

create index if not exists idx_offer_brand_kits_market
    on offer_brand_kits(market_id, updated_at desc);

create table if not exists offer_campaign_kits (
    id uuid primary key,
    market_id uuid not null references markets(id) on delete cascade,
    kit_key varchar(120),
    name varchar(255) not null,
    description varchar(2000),
    season_key varchar(120),
    starts_at timestamp,
    ends_at timestamp,
    tokens_json text not null,
    assets_json text not null,
    is_active boolean not null default true,
    is_system_kit boolean not null default false,
    created_at timestamp,
    updated_at timestamp
);

create unique index if not exists uk_offer_campaign_kits_market_key
    on offer_campaign_kits(market_id, kit_key);

create index if not exists idx_offer_campaign_kits_market
    on offer_campaign_kits(market_id, updated_at desc);

alter table offer_templates
    add column if not exists schema_version integer not null default 2,
    add column if not exists master_template_key varchar(160),
    add column if not exists default_variant_key varchar(120),
    add column if not exists brand_kit_id uuid references offer_brand_kits(id) on delete set null,
    add column if not exists campaign_kit_id uuid references offer_campaign_kits(id) on delete set null;

create index if not exists idx_offer_templates_brand_kit
    on offer_templates(brand_kit_id);

create index if not exists idx_offer_templates_campaign_kit
    on offer_templates(campaign_kit_id);

create table if not exists offer_template_variants (
    id uuid primary key,
    template_id uuid not null references offer_templates(id) on delete cascade,
    variant_key varchar(120) not null,
    name varchar(255) not null,
    canvas_width integer not null,
    canvas_height integer not null,
    variant_json text not null,
    preview_image_url varchar(2000),
    is_active boolean not null default true,
    created_at timestamp,
    updated_at timestamp
);

create unique index if not exists uk_offer_template_variants_template_key
    on offer_template_variants(template_id, variant_key);

create index if not exists idx_offer_template_variants_template
    on offer_template_variants(template_id, updated_at desc);

alter table offer_generation_jobs
    add column if not exists variant_key varchar(120),
    add column if not exists publish_targets_json text,
    add column if not exists render_options_json text;

alter table offer_generation_job_items
    add column if not exists slot_index integer,
    add column if not exists zone_id varchar(120),
    add column if not exists resolved_binding_json text;

update offer_generation_job_items
set slot_index = position_index
where slot_index is null;

update offer_generation_job_items
set resolved_binding_json = binding_json
where resolved_binding_json is null;

create table if not exists offer_render_outputs (
    id uuid primary key,
    market_id uuid not null references markets(id) on delete cascade,
    job_id uuid not null references offer_generation_jobs(id) on delete cascade,
    template_id uuid references offer_templates(id) on delete set null,
    variant_key varchar(120),
    output_type varchar(80) not null,
    publish_target varchar(120),
    status varchar(80) not null,
    file_url varchar(2000),
    preview_image_url varchar(2000),
    error_message varchar(2000),
    render_options_json text,
    created_at timestamp,
    updated_at timestamp
);

create index if not exists idx_offer_render_outputs_job
    on offer_render_outputs(job_id, created_at desc);

create index if not exists idx_offer_render_outputs_market
    on offer_render_outputs(market_id, created_at desc);
