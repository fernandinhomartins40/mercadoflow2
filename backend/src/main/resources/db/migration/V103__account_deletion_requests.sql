-- LGPD-03: "Excluir minha conta" no painel e no Bipaê.
--
-- O pedido bloqueia o acesso na hora (users.is_active = false e
-- credentials_changed_at = now(), que derruba as sessões; ver V98) e marca a
-- anonimização para daqui a 30 dias. Dentro do prazo a pessoa pode desistir.
-- O AccountDeletionJob anonimiza os pedidos vencidos toda noite.
--
-- scope:
--   USER  = membro da equipe: só o próprio usuário;
--   STORE = dono sozinho: o usuário e a conta da loja (rede inteira, market_id = matriz).
-- status: PENDING -> CANCELED (desistiu) | DONE (anonimizado).
create table if not exists account_deletion_requests (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references users (id) on delete cascade,
    market_id         uuid references markets (id) on delete set null,
    scope             varchar(8)  not null,
    status            varchar(10) not null default 'PENDING',
    requested_at      timestamp   not null default now(),
    scheduled_for     timestamp   not null,
    canceled_at       timestamp,
    completed_at      timestamp,
    -- O que aconteceu com a assinatura no pedido (cancelada no Asaas/Stripe, negociada, sem assinatura).
    subscription_note varchar(200),
    constraint ck_account_deletion_scope check (scope in ('USER', 'STORE')),
    constraint ck_account_deletion_status check (status in ('PENDING', 'CANCELED', 'DONE'))
);

-- Um pedido em aberto por pessoa.
create unique index if not exists uq_account_deletion_pending
    on account_deletion_requests (user_id) where status = 'PENDING';
-- O job procura só os pendentes vencidos.
create index if not exists idx_account_deletion_due
    on account_deletion_requests (scheduled_for) where status = 'PENDING';

-- RLS como na V99 (market_id anulável): o painel e o login usam runAsSystem;
-- o job roda com a role dona do schema.
alter table account_deletion_requests enable row level security;
drop policy if exists tenant_isolation on account_deletion_requests;
create policy tenant_isolation on account_deletion_requests for all
    using (current_setting('app.is_admin', true) = 'true'
        or market_id is null
        or market_id = nullif(current_setting('app.current_market', true), '')::uuid)
    with check (current_setting('app.is_admin', true) = 'true'
        or market_id is null
        or market_id = nullif(current_setting('app.current_market', true), '')::uuid);

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'mercadoflow_app') then
        grant select, insert, update, delete on account_deletion_requests to mercadoflow_app;
    end if;
end $$;
