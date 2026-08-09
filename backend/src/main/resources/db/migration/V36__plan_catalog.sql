-- Catalogo de planos editavel pelo painel super admin.
--
-- Ate aqui precos e limites viviam como constantes no enum PlanType: mudar o
-- valor de um plano exigia alterar codigo e fazer deploy, e nada disso chegava
-- ao Stripe. Esta tabela passa a ser a fonte de verdade, com o enum servindo
-- apenas de semente e de fallback quando a linha nao existir.
--
-- O price_id do Stripe fica aqui: e o elo que faz o painel e o Stripe andarem
-- juntos. Ao mudar o preco, criamos um novo Price no Stripe (objeto imutavel
-- por design) e gravamos o id novo nesta coluna; o anterior vai para
-- previous_stripe_price_id, de modo que quem ja assina continua no valor
-- contratado ate ser migrado explicitamente.

create table plan_catalog (
    -- FREE, ESSENCIAL, PROFISSIONAL, REDE — mesmos nomes do enum PlanType.
    code                      varchar(24) primary key,
    display_name              varchar(80)  not null,
    description               varchar(500),

    monthly_price_cents       integer      not null default 0,

    -- Limites. -1 = sem teto (mesma convencao de PlanType.UNLIMITED).
    monthly_invoice_limit     integer      not null default 1000,
    branch_limit              integer      not null default 1,
    pdv_per_branch_limit      integer      not null default 1,
    pdv_limit                 integer      not null default 1,
    user_seat_limit           integer      not null default 2,
    history_retention_days    integer      not null default 90,
    full_insights             boolean      not null default false,

    -- Stripe
    stripe_product_id         varchar(64),
    stripe_price_id           varchar(64),
    -- Guardado para rastrear reajustes e permitir migrar assinantes depois.
    previous_stripe_price_id  varchar(64),
    price_changed_at          timestamp,

    -- Planos sob medida (REDE) e o gratuito nao sao vendidos pelo checkout.
    purchasable               boolean      not null default false,
    -- Ordem de exibicao na pagina de planos.
    display_order             integer      not null default 0,
    is_active                 boolean      not null default true,

    created_at                timestamp    not null default now(),
    updated_at                timestamp    not null default now()
);

-- Semente com os valores que hoje estao no enum. A partir daqui, o painel
-- edita esta tabela e o enum deixa de ser tocado.
insert into plan_catalog (
    code, display_name, description, monthly_price_cents,
    monthly_invoice_limit, branch_limit, pdv_per_branch_limit, pdv_limit,
    user_seat_limit, history_retention_days, full_insights,
    purchasable, display_order
) values
    ('FREE', 'Gratuito',
     'Para comecar sem cartao de credito',
     0, 1000, 1, 1, 1, 2, 90, false, false, 1),
    ('ESSENCIAL', 'Essencial',
     'Loja unica que ja opera de verdade',
     19700, 15000, 1, 3, 3, 5, 365, true, true, 2),
    ('PROFISSIONAL', 'Profissional',
     'Operacao com algumas lojas ou mais caixas',
     39700, 50000, 3, 4, 10, 15, 730, true, true, 3),
    ('REDE', 'Rede',
     'Redes maiores, com limites negociados',
     -1, -1, -1, -1, -1, -1, -1, true, false, 4);

-- ── Historico de alteracao de preco ────────────────────────────────────────
-- Trilha do que foi cobrado e quando. Sem isso, uma contestacao de cobranca
-- ficaria sem resposta: nao haveria como provar qual preco vigorava na data.
create table plan_price_history (
    id                 uuid primary key default gen_random_uuid(),
    plan_code          varchar(24) not null references plan_catalog (code) on delete cascade,

    from_price_cents   integer,
    to_price_cents     integer     not null,

    stripe_price_id    varchar(64),
    -- Quantas assinaturas foram movidas para o novo preco (0 = so novos).
    migrated_count     integer     not null default 0,

    reason             varchar(500),
    actor_email        varchar(255),
    created_at         timestamp   not null default now()
);

create index idx_plan_price_history_plan on plan_price_history (plan_code, created_at desc);
