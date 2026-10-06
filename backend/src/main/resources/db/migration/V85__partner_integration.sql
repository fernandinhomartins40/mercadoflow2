-- API de integração para ERPs (docs/PROPOSTA-DECISOES-E-INTEGRACAO.md, fases 3 a 5).
-- A plataforma recebe catálogo, custo, preço, estoque e entradas; entrega só a
-- "entrada de mercadoria pronta" (notas do Confere) e o que o dono aprovou.
-- Nada de inteligência de desempenho sai por aqui.

create table if not exists integration_partners (
    id              uuid primary key default gen_random_uuid(),
    name            varchar(200) not null,
    contact_email   varchar(255),
    website         varchar(255),
    client_id       varchar(64) not null unique,
    secret_hash     varchar(128) not null,
    status          varchar(20) not null default 'REGISTRADO',  -- REGISTRADO | HOMOLOGADO | SUSPENSO
    public_listing  boolean not null default false,
    webhook_url     text,
    webhook_secret  varchar(128),
    created_at      timestamp not null default now(),
    updated_at      timestamp not null default now()
);

-- Tokens de acesso (opacos, guardados só como hash, 1 hora).
create table if not exists partner_tokens (
    token_hash  varchar(64) primary key,
    partner_id  uuid not null references integration_partners(id) on delete cascade,
    expires_at  timestamp not null
);
create index if not exists idx_partner_tokens_expires on partner_tokens (expires_at);

-- Autorização da loja ao parceiro, por escopo. A loja revoga quando quiser.
create table if not exists partner_market_links (
    id              uuid primary key default gen_random_uuid(),
    partner_id      uuid not null references integration_partners(id) on delete cascade,
    market_id       uuid not null references markets(id) on delete cascade,
    scopes          text[] not null,
    status          varchar(20) not null default 'ATIVO',  -- ATIVO | REVOGADO
    authorized_by   varchar(200),
    authorized_at   timestamp not null default now(),
    revoked_at      timestamp,
    last_stock_at   timestamp,
    last_prices_at  timestamp,
    last_costs_at   timestamp,
    constraint uq_partner_market unique (partner_id, market_id)
);

alter table partner_market_links enable row level security;
create policy tenant_isolation on partner_market_links for all using (
    current_setting('app.is_admin', true) = 'true'
    or market_id = nullif(current_setting('app.current_market', true), '')::uuid
);

-- Cada chamada do parceiro, visível ao lojista.
create table if not exists partner_api_log (
    id          bigserial primary key,
    partner_id  uuid not null references integration_partners(id) on delete cascade,
    market_id   uuid references markets(id) on delete cascade,
    method      varchar(10) not null,
    path        varchar(200) not null,
    items       integer not null default 0,
    accepted    integer not null default 0,
    rejected    integer not null default 0,
    status      integer not null,
    dry_run     boolean not null default false,
    at          timestamp not null default now()
);
create index if not exists idx_partner_api_log_market on partner_api_log (market_id, at desc);
create index if not exists idx_partner_api_log_partner on partner_api_log (partner_id, at desc);

alter table partner_api_log enable row level security;
create policy tenant_isolation on partner_api_log for all using (
    current_setting('app.is_admin', true) = 'true'
    or market_id = nullif(current_setting('app.current_market', true), '')::uuid
);

-- Idempotência dos lotes (24 h).
create table if not exists partner_idempotency (
    partner_id   uuid not null references integration_partners(id) on delete cascade,
    idem_key     varchar(120) not null,
    market_id    uuid not null,
    path         varchar(200) not null,
    response     jsonb not null,
    created_at   timestamp not null default now(),
    primary key (partner_id, idem_key)
);

-- Saída: só eventos decididos pelo dono (pedido enviado, preço aprovado).
create table if not exists partner_webhook_events (
    id               uuid primary key default gen_random_uuid(),
    partner_id       uuid not null references integration_partners(id) on delete cascade,
    market_id        uuid not null references markets(id) on delete cascade,
    event            varchar(50) not null,
    payload          jsonb not null,
    status           varchar(20) not null default 'PENDENTE',  -- PENDENTE | ENTREGUE | FALHOU
    attempts         integer not null default 0,
    next_attempt_at  timestamp not null default now(),
    last_error       text,
    created_at       timestamp not null default now(),
    delivered_at     timestamp
);
create index if not exists idx_partner_webhook_pending on partner_webhook_events (status, next_attempt_at);

alter table partner_webhook_events enable row level security;
create policy tenant_isolation on partner_webhook_events for all using (
    current_setting('app.is_admin', true) = 'true'
    or market_id = nullif(current_setting('app.current_market', true), '')::uuid
);

-- "Peça ao seu ERP": a demanda por integração, por ERP.
create table if not exists erp_integration_requests (
    id            uuid primary key default gen_random_uuid(),
    market_id     uuid not null references markets(id) on delete cascade,
    erp_name      varchar(200) not null,
    vendor_email  varchar(255),
    note          text,
    created_by    varchar(200),
    emailed       boolean not null default false,
    created_at    timestamp not null default now()
);

alter table erp_integration_requests enable row level security;
create policy tenant_isolation on erp_integration_requests for all using (
    current_setting('app.is_admin', true) = 'true'
    or market_id = nullif(current_setting('app.current_market', true), '')::uuid
);
