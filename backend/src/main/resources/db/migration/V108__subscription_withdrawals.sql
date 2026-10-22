-- Desistência em 7 dias (CDC art. 49; parecer em docs/pie/juridico/PARECER_LGPD.md, item S2).
--
-- Quem contratou o primeiro plano pago pela internet pode desistir em até 7
-- dias corridos do primeiro pagamento confirmado: o pagamento é estornado no
-- Asaas e a assinatura volta ao Grátis na hora (WithdrawalService).
--
-- A linha nasce REQUESTED ANTES do estorno, gravada fora de transação: o aviso
-- PAYMENT_REFUNDED do Asaas pode chegar antes do fim do pedido, e o webhook usa
-- esta linha para não aplicar de novo o fluxo de estorno/atraso (D-01).
-- status: REQUESTED -> DONE (estornado e cancelado) | FAILED (o Asaas recusou; nada mudou).
create table if not exists subscription_withdrawals (
    id                       bigserial primary key,
    market_id                uuid        not null references markets (id) on delete cascade,
    payment_id               varchar(80) not null,
    provider_subscription_id varchar(80),
    plan_code                varchar(20),
    value_cents              int,
    status                   varchar(10) not null default 'REQUESTED',
    reason                   varchar(30),
    comment                  varchar(600),
    actor                    varchar(200),
    error                    varchar(300),
    requested_at             timestamp   not null default now(),
    finished_at              timestamp,
    constraint ck_subscription_withdrawal_status check (status in ('REQUESTED', 'DONE', 'FAILED'))
);

-- Uma desistência valendo por conta: dois cliques não estornam duas vezes.
create unique index if not exists uq_subscription_withdrawal_active
    on subscription_withdrawals (market_id) where status in ('REQUESTED', 'DONE');
create index if not exists idx_subscription_withdrawal_payment
    on subscription_withdrawals (payment_id);

-- RLS como as demais tabelas com market_id (V99). O pedido e o webhook rodam em runAsSystem.
alter table subscription_withdrawals enable row level security;
drop policy if exists tenant_isolation on subscription_withdrawals;
create policy tenant_isolation on subscription_withdrawals for all
    using (current_setting('app.is_admin', true) = 'true'
        or market_id = nullif(current_setting('app.current_market', true), '')::uuid)
    with check (current_setting('app.is_admin', true) = 'true'
        or market_id = nullif(current_setting('app.current_market', true), '')::uuid);

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'mercadoflow_app') then
        grant select, insert, update on subscription_withdrawals to mercadoflow_app;
        grant usage on sequence subscription_withdrawals_id_seq to mercadoflow_app;
    end if;
end $$;
