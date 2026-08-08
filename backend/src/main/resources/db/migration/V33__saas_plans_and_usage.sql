-- Planos, limites e medicao de uso do SaaS.
--
-- Ate aqui plan_type (BASIC/INTERMEDIATE/ADVANCED) era um rotulo decorativo:
-- nenhum ponto do codigo consultava o plano para liberar ou limitar nada, e
-- user_seat_limit era gravado mas nunca verificado. Esta migracao substitui
-- isso por limites reais, medidos e aplicados.
--
-- Modelo escolhido (limite por USO, nao por feature):
--   FREE        1.000 notas/mes, 1 PDV, 2 usuarios, 90 dias de historico
--   PRO        15.000 notas/mes, 5 PDVs, 10 usuarios, 24 meses
--   ENTERPRISE ilimitado
--
-- O plano gratuito ve toda a inteligencia, porem limitada aos 5 principais
-- itens de cada lista: prova o valor sem substituir a operacao.

-- ── 1. Novos valores de plano ──────────────────────────────────────────────
-- plan_type e varchar no banco (mapeado como enum na aplicacao), entao basta
-- reescrever os valores existentes. BASIC vira FREE apenas para mercados que
-- ainda nao operam; os demais sobem para PRO, para nao remover acesso de quem
-- ja estava usando o sistema.
update markets set plan_type = 'ENTERPRISE' where plan_type = 'ADVANCED';
update markets set plan_type = 'PRO'        where plan_type = 'INTERMEDIATE';
update markets set plan_type = 'PRO'        where plan_type = 'BASIC'
    and exists (select 1 from invoices i where i.market_id = markets.id);
update markets set plan_type = 'FREE'       where plan_type = 'BASIC';
update markets set plan_type = 'FREE'       where plan_type is null;

-- ── 2. Campos de assinatura no mercado ─────────────────────────────────────
alter table markets
    -- Inicio do ciclo de cobranca: define a janela de contagem mensal de notas.
    add column if not exists billing_cycle_start date,
    -- Sobrescreve o limite do plano para um cliente especifico (negociacao,
    -- cortesia, piloto). Nulo = usa o limite padrao do plano.
    add column if not exists invoice_limit_override integer,
    add column if not exists pdv_limit_override     integer,
    add column if not exists seat_limit_override    integer,
    -- Marca contas internas/demo que nao devem sofrer limite algum.
    add column if not exists is_unlimited boolean not null default false,
    add column if not exists plan_changed_at timestamp,
    add column if not exists plan_notes varchar(1000);

update markets set billing_cycle_start = coalesce(cast(created_at as date), current_date)
where billing_cycle_start is null;

-- ── 3. Contadores de uso por ciclo ─────────────────────────────────────────
-- Uma linha por mercado por mes. O contador e incrementado na ingestao, que e
-- o ponto onde o limite precisa ser decidido em O(1) — contar invoices a cada
-- nota chegando nao escalaria.
create table market_usage_counters (
    id                 uuid primary key default gen_random_uuid(),
    market_id          uuid not null references markets (id) on delete cascade,

    -- Primeiro dia do ciclo (sempre normalizado para o dia 1 do mes).
    cycle_start        date not null,

    invoices_ingested  integer not null default 0,
    invoices_rejected  integer not null default 0,
    items_ingested     integer not null default 0,

    first_ingest_at    timestamp,
    last_ingest_at     timestamp,
    -- Momento em que o teto foi atingido pela primeira vez no ciclo: alimenta
    -- o aviso na UI e a metrica de conversao.
    limit_reached_at   timestamp,

    updated_at         timestamp not null default now(),

    constraint uq_usage_counter_market_cycle unique (market_id, cycle_start)
);

create index idx_usage_counter_market on market_usage_counters (market_id, cycle_start desc);
create index idx_usage_counter_limit_reached on market_usage_counters (limit_reached_at)
    where limit_reached_at is not null;

-- ── 4. Historico de assinatura ─────────────────────────────────────────────
-- Trilha de tudo que mudou no plano/cobranca de um mercado. O super admin
-- precisa responder "quem mudou o plano deste cliente, quando e por que".
create table subscription_events (
    id             uuid primary key default gen_random_uuid(),
    market_id      uuid not null references markets (id) on delete cascade,

    -- PLAN_CHANGED, STATUS_CHANGED, LIMIT_OVERRIDE, TRIAL_STARTED,
    -- TRIAL_ENDED, LIMIT_REACHED, REACTIVATED, CANCELLED
    event_type     varchar(32) not null,

    from_plan      varchar(24),
    to_plan        varchar(24),
    from_status    varchar(24),
    to_status      varchar(24),

    reason         varchar(1000),
    metadata       text,

    -- Nulo quando o evento foi gerado pelo proprio sistema (ex.: LIMIT_REACHED).
    actor_user_id  uuid references users (id) on delete set null,
    actor_email    varchar(255),

    created_at     timestamp not null default now()
);

create index idx_subscription_events_market on subscription_events (market_id, created_at desc);
create index idx_subscription_events_type on subscription_events (event_type, created_at desc);

-- ── 5. RLS ─────────────────────────────────────────────────────────────────
-- market_usage_counters entra na RLS por tenant: o proprio mercado consulta seu
-- consumo para exibir o medidor na UI.
--
-- subscription_events fica FORA da RLS deliberadamente, como markets e
-- agent_api_keys em V29: e uma trilha administrativa, lida pelo super admin
-- (escopo global) e escrita durante operacoes que nao tem contexto de tenant.
alter table market_usage_counters enable row level security;
create policy tenant_isolation on market_usage_counters for all using (
    current_setting('app.is_admin', true) = 'true'
    or market_id = nullif(current_setting('app.current_market', true), '')::uuid
);
