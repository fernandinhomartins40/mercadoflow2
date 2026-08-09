-- Cobranca de assinaturas via Stripe.
--
-- O Stripe e a fonte de verdade sobre pagamento; o banco guarda apenas os
-- identificadores necessarios para amarrar a assinatura ao mercado e o ultimo
-- estado conhecido, sincronizado por webhook.
--
-- Os limites continuam vindo de PlanType/overrides (V33/V34): o Stripe diz
-- QUAL plano o cliente pagou, nao O QUE cada plano permite. Manter essa
-- separacao evita ter regra de negocio espalhada entre o painel do Stripe e o
-- codigo.

alter table markets
    -- Cliente no Stripe. Criado no primeiro checkout e reaproveitado depois,
    -- para o historico de cobranca do mercado ficar num unico cliente.
    add column if not exists stripe_customer_id     varchar(64),
    add column if not exists stripe_subscription_id varchar(64),
    -- Espelho do status da assinatura no Stripe (active, past_due, canceled...).
    add column if not exists stripe_status          varchar(32),
    add column if not exists stripe_price_id        varchar(64),
    -- Fim do periodo pago: ate esta data o acesso continua, mesmo apos cancelar.
    add column if not exists current_period_end     timestamp,
    add column if not exists cancel_at_period_end   boolean not null default false;

create unique index if not exists idx_markets_stripe_customer
    on markets (stripe_customer_id) where stripe_customer_id is not null;
create index if not exists idx_markets_stripe_subscription
    on markets (stripe_subscription_id);

-- ── Eventos processados ────────────────────────────────────────────────────
-- O Stripe reenvia webhooks ate receber 2xx, e nao garante entrega unica. Sem
-- registro do que ja foi processado, um reenvio poderia rebaixar um plano que
-- ja voltou a ativo, ou aplicar duas vezes a mesma mudanca.
create table stripe_processed_events (
    event_id     varchar(64) primary key,
    event_type   varchar(64) not null,
    market_id    uuid references markets (id) on delete set null,
    processed_at timestamp not null default now()
);

create index idx_stripe_events_processed_at on stripe_processed_events (processed_at desc);
