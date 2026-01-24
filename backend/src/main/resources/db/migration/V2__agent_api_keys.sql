create table if not exists agent_api_keys (
    id uuid primary key,
    market_id uuid not null,
    name text not null,
    key_hash text not null unique,
    key_prefix text not null,
    last_used_at timestamp,
    is_active boolean,
    created_at timestamp,
    foreign key (market_id) references markets(id)
);

create index if not exists idx_agent_api_key_market on agent_api_keys(market_id);
