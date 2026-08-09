-- CRM comercial: atividades, follow-ups e regua de cobranca.
--
-- Ate aqui o painel respondia "qual o estado do cliente", mas nao guardava o
-- TRABALHO feito sobre ele: quem ligou, o que foi combinado, quando retornar.
-- Esse historico vivia no WhatsApp de quem negociou e se perdia.
--
-- Tres blocos:
--   1. customer_activities  — linha do tempo por conta (ligacao, e-mail, nota,
--      alteracao de plano, cobranca enviada). Alimenta a ficha 360.
--   2. customer_tasks       — follow-ups com prazo e responsavel.
--   3. dunning_rules/logs   — regua de cobranca: o que fazer, e quando, quando
--      uma fatura vence.

-- ── 1. Linha do tempo do cliente ───────────────────────────────────────────
create table customer_activities (
    id           uuid primary key default gen_random_uuid(),
    market_id    uuid not null references markets (id) on delete cascade,

    -- NOTE, CALL, EMAIL, MEETING, WHATSAPP  (registradas a mao)
    -- PLAN_CHANGE, PAYMENT, INVOICE_SENT, LIMIT_REACHED, SIGNUP  (do sistema)
    activity_type varchar(24) not null,
    title         varchar(255) not null,
    body          text,

    -- Sistema x pessoa: a UI separa o que foi feito do que aconteceu.
    automated     boolean not null default false,

    -- Ancoras opcionais para o evento que originou a atividade.
    invoice_id    uuid references network_invoices (id) on delete set null,
    contract_id   uuid references network_contracts (id) on delete set null,

    actor_email   varchar(255),
    created_at    timestamp not null default now()
);

create index idx_customer_activity_market on customer_activities (market_id, created_at desc);
create index idx_customer_activity_type on customer_activities (activity_type, created_at desc);

-- ── 2. Follow-ups ──────────────────────────────────────────────────────────
create table customer_tasks (
    id            uuid primary key default gen_random_uuid(),
    market_id     uuid not null references markets (id) on delete cascade,

    title         varchar(255) not null,
    description   text,
    -- OPEN, DONE, CANCELLED
    status        varchar(16) not null default 'OPEN',
    -- LOW, NORMAL, HIGH
    priority      varchar(16) not null default 'NORMAL',

    due_date      date,
    assignee_email varchar(255),

    completed_at  timestamp,
    completed_by  varchar(255),

    created_by    varchar(255),
    created_at    timestamp not null default now(),
    updated_at    timestamp not null default now()
);

-- Consulta principal do painel: tarefas abertas por prazo.
create index idx_customer_task_open on customer_tasks (due_date)
    where status = 'OPEN';
create index idx_customer_task_market on customer_tasks (market_id, created_at desc);

-- ── 3. Regua de cobranca ───────────────────────────────────────────────────
-- Cada regra dispara N dias APOS o vencimento (offset positivo) ou ANTES
-- (negativo, para o lembrete preventivo).
create table dunning_rules (
    id            uuid primary key default gen_random_uuid(),
    name          varchar(120) not null,
    -- Dias em relacao ao vencimento: -3 = 3 dias antes, 7 = 7 dias depois.
    days_offset   integer not null,
    -- RESEND_INVOICE, CREATE_TASK, NOTIFY_ADMIN, MARK_PAST_DUE
    action        varchar(32) not null,
    message       varchar(500),
    is_active     boolean not null default true,
    created_at    timestamp not null default now(),

    constraint uq_dunning_rule_offset_action unique (days_offset, action)
);

-- Regua padrao. Deliberadamente sem bloqueio automatico: rede grande tem
-- tramite interno de pagamento, e suspender sozinho quebraria a operacao de um
-- cliente que so aguarda aprovacao no financeiro.
insert into dunning_rules (name, days_offset, action, message) values
    ('Lembrete antes do vencimento', -3, 'RESEND_INVOICE',
     'Sua fatura vence em 3 dias.'),
    ('Aviso no vencimento',           0, 'RESEND_INVOICE',
     'Sua fatura vence hoje.'),
    ('Primeira cobranca',             3, 'RESEND_INVOICE',
     'Fatura vencida ha 3 dias.'),
    ('Abrir follow-up',               7, 'CREATE_TASK',
     'Entrar em contato: fatura vencida ha 7 dias.'),
    ('Alertar administrador',        15, 'NOTIFY_ADMIN',
     'Inadimplencia de 15 dias — avaliar suspensao.');

-- Registro do que a regua ja executou. Sem ele, o job reenviaria a mesma
-- cobranca a cada rodada, transformando a regua em spam.
create table dunning_logs (
    id           uuid primary key default gen_random_uuid(),
    invoice_id   uuid not null references network_invoices (id) on delete cascade,
    rule_id      uuid not null references dunning_rules (id) on delete cascade,
    market_id    uuid references markets (id) on delete set null,

    action       varchar(32) not null,
    success      boolean     not null default true,
    detail       varchar(500),
    executed_at  timestamp   not null default now(),

    constraint uq_dunning_log_invoice_rule unique (invoice_id, rule_id)
);

create index idx_dunning_log_executed on dunning_logs (executed_at desc);

-- ── 4. Responsavel comercial pela conta ────────────────────────────────────
alter table markets
    add column if not exists account_owner_email varchar(255),
    -- Health score 0-100, recalculado por job (uso, pagamento, engajamento).
    add column if not exists health_score integer,
    add column if not exists health_updated_at timestamp;

create index if not exists idx_markets_account_owner on markets (account_owner_email);

-- ── 5. RLS ─────────────────────────────────────────────────────────────────
-- Todas ficam FORA da RLS por tenant: sao dados administrativos, lidos e
-- escritos pelo super admin, cujo escopo e global — mesma razao de
-- subscription_events em V33 e network_contracts em V37.
