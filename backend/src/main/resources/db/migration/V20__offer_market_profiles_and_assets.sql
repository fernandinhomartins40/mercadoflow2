create table if not exists offer_market_profiles (
    id uuid primary key,
    market_id uuid not null unique references markets(id) on delete cascade,
    footer_content varchar(600),
    footer_legal_text varchar(2000),
    primary_logo_url varchar(2000),
    primary_logo_storage_key varchar(255),
    secondary_logo_url varchar(2000),
    secondary_logo_storage_key varchar(255),
    created_at timestamp,
    updated_at timestamp
);

create unique index if not exists uk_offer_market_profiles_market
    on offer_market_profiles(market_id);
