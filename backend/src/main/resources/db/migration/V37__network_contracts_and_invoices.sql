-- Contratos sob medida (plano REDE) e espelho das faturas do Stripe.
--
-- O plano REDE nao tem preco de tabela: cada rede negocia valor e limites. Ate
-- aqui o painel guardava custom_price_cents e os overrides, mas nada gerava
-- cobranca — o valor combinado ficava sem fatura.
--
-- Modelo de cobranca escolhido: assinatura no Stripe com
-- collection_method=send_invoice, que emite fatura recorrente com boleto e
-- cartao e a envia por e-mail. E o formato que redes usam na pratica (boleto
-- com prazo, contra nota fiscal), diferente do debito automatico dos planos de
-- prateleira.
--
-- Sobre "conciliacao bancaria": nao ha leitura de retorno CNAB nem extrato. O
-- Stripe compensa o boleto e dispara invoice.paid no dia util seguinte; a
-- tabela network_invoices espelha esse estado para o painel responder quem
-- deve, ha quantos dias e quanto entrou — sem consultar a API a cada tela.

-- ── 1. Contrato da rede ────────────────────────────────────────────────────
create table network_contracts (
    id                     uuid primary key default gen_random_uuid(),
    market_id              uuid not null references markets (id) on delete cascade,

    -- Valor mensal negociado, em centavos.
    monthly_price_cents    integer not null,
    -- Dias entre a emissao da fatura e o vencimento.
    days_until_due         integer not null default 15,

    -- Limites contratados. -1 = sem teto. Nulo herda o override do mercado.
    invoice_limit          integer,
    branch_limit           integer,
    pdv_per_branch_limit   integer,
    pdv_limit              integer,
    seat_limit             integer,

    -- Stripe: Price dedicado a esta rede (nao aparece no catalogo publico).
    stripe_price_id        varchar(64),
    stripe_subscription_id varchar(64),

    -- ACTIVE, SUSPENDED, ENDED
    status                 varchar(16) not null default 'ACTIVE',

    contact_name           varchar(255),
    contact_email          varchar(255),
    notes                  varchar(2000),

    started_at             timestamp not null default now(),
    ended_at               timestamp,
    created_by             varchar(255),
    created_at             timestamp not null default now(),
    updated_at             timestamp not null default now()
);

-- Uma rede tem no maximo um contrato ativo; encerrados ficam no historico.
create unique index idx_network_contract_active
    on network_contracts (market_id) where status = 'ACTIVE';
create index idx_network_contract_market on network_contracts (market_id, created_at desc);

-- ── 2. Espelho das faturas ─────────────────────────────────────────────────
-- Uma linha por fatura do Stripe, mantida por webhook. Existe para o painel
-- listar inadimplencia e receita sem depender da API a cada carregamento, e
-- para preservar o historico caso a conta do Stripe seja trocada.
create table network_invoices (
    id                  uuid primary key default gen_random_uuid(),
    market_id           uuid not null references markets (id) on delete cascade,
    contract_id         uuid references network_contracts (id) on delete set null,

    stripe_invoice_id   varchar(64) not null unique,
    invoice_number      varchar(64),

    -- draft, open, paid, void, uncollectible
    status              varchar(24) not null,
    amount_due_cents    integer not null default 0,
    amount_paid_cents   integer not null default 0,
    currency            varchar(8)  not null default 'brl',

    -- Link e PDF hospedados pelo Stripe: e por onde o cliente paga o boleto.
    hosted_invoice_url  varchar(500),
    invoice_pdf_url     varchar(500),

    period_start        timestamp,
    period_end          timestamp,
    due_date            timestamp,
    -- Preenchido quando invoice.paid chega (no boleto, no dia util seguinte).
    paid_at             timestamp,
    voided_at           timestamp,

    attempt_count       integer not null default 0,
    created_at          timestamp not null default now(),
    updated_at          timestamp not null default now()
);

create index idx_network_invoice_market on network_invoices (market_id, created_at desc);
create index idx_network_invoice_status on network_invoices (status, due_date);
-- Consulta de inadimplencia: faturas em aberto com vencimento passado.
create index idx_network_invoice_overdue on network_invoices (due_date)
    where status = 'open';

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
-- network_invoices entra na RLS: o proprio mercado consulta suas faturas.
-- network_contracts fica fora, como agent_api_keys em V29 — e dado
-- administrativo, lido pelo super admin, cujo escopo e global.
alter table network_invoices enable row level security;
create policy tenant_isolation on network_invoices for all using (
    current_setting('app.is_admin', true) = 'true'
    or market_id = nullif(current_setting('app.current_market', true), '')::uuid
);
