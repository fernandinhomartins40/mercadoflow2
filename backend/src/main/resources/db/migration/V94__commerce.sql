-- MercadoFlow Vendas (docs/PROPOSTA-MERCADOFLOW-VENDAS.md).
--
-- Indústrias e distribuidores vendem ao supermercado dentro da plataforma:
-- catálogo, tabela de preço por território, campanhas e pedido. O motor de
-- canal (CommerceChannelService) decide, loja a loja e produto a produto, se a
-- oferta chega direto, via distribuidor ou não chega, conforme os acordos de
-- distribuição declarados pela indústria.
--
-- A regra de anonimato dos agregados (V78) não muda. A identidade da loja só
-- chega ao vendedor por pedido ou por autorização dela.

-- ── Vendedores ─────────────────────────────────────────────────────────────
CREATE TABLE commerce_sellers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind               VARCHAR(12) NOT NULL,                     -- INDUSTRIA | DISTRIBUIDOR
    cnpj               VARCHAR(14) NOT NULL UNIQUE,
    legal_name         VARCHAR(160) NOT NULL,
    trade_name         VARCHAR(120),
    status             VARCHAR(12) NOT NULL DEFAULT 'EM_ANALISE', -- EM_ANALISE | ATIVO | SUSPENSO | ENCERRADO
    status_reason      VARCHAR(300),
    -- Indústria que também tem o portal de dados (V78).
    industry_id        UUID UNIQUE REFERENCES industries (id) ON DELETE SET NULL,
    -- Só indústria. DIRETO: vende ao supermercado. DISTRIBUIDOR: só por
    -- distribuidor. MISTO: direto onde não houver distribuidor exclusivo.
    sales_mode         VARCHAR(12) NOT NULL DEFAULT 'DIRETO',
    -- Onde entrega. Os dois vazios = Brasil inteiro.
    service_ufs        TEXT[] NOT NULL DEFAULT '{}',
    service_cities     TEXT[] NOT NULL DEFAULT '{}',              -- códigos IBGE
    min_order_cents    INT NOT NULL DEFAULT 0,
    payment_terms      VARCHAR(300),
    delivery_terms     VARCHAR(300),
    contact_name       VARCHAR(120),
    contact_email      VARCHAR(160),
    contact_phone      VARCHAR(30),
    notes              TEXT,
    -- Cobrança do uso: mensalidade e taxa sobre o pedido entregue.
    monthly_fee_cents  INT NOT NULL DEFAULT 0,
    order_fee_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
    -- Termo de responsabilidade sobre os acordos de distribuição declarados.
    attested_at        TIMESTAMP,
    attested_by        VARCHAR(160),
    created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (kind IN ('INDUSTRIA', 'DISTRIBUIDOR')),
    CHECK (status IN ('EM_ANALISE', 'ATIVO', 'SUSPENSO', 'ENCERRADO')),
    CHECK (sales_mode IN ('DIRETO', 'DISTRIBUIDOR', 'MISTO'))
);

ALTER TABLE users ADD COLUMN seller_id UUID REFERENCES commerce_sellers (id) ON DELETE SET NULL;
CREATE INDEX idx_users_seller ON users (seller_id) WHERE seller_id IS NOT NULL;

-- ── Acordos de distribuição (declarados pela indústria) ────────────────────
-- Área e produtos vazios = sem restrição. EXCLUSIVO: na área, a indústria não
-- vende direto e as campanhas dela chegam via este distribuidor.
-- block_other_sellers: na área, só este distribuidor vende os produtos da
-- indústria na plataforma.
CREATE TABLE commerce_distribution_agreements (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry_seller_id    UUID NOT NULL REFERENCES commerce_sellers (id) ON DELETE CASCADE,
    distributor_seller_id UUID REFERENCES commerce_sellers (id) ON DELETE SET NULL,
    distributor_cnpj      VARCHAR(14) NOT NULL,
    distributor_name      VARCHAR(160) NOT NULL,
    exclusivity           VARCHAR(14) NOT NULL DEFAULT 'EXCLUSIVO',
    block_other_sellers   BOOLEAN NOT NULL DEFAULT FALSE,
    scope_ufs             TEXT[] NOT NULL DEFAULT '{}',
    scope_cities          TEXT[] NOT NULL DEFAULT '{}',
    scope_brands          TEXT[] NOT NULL DEFAULT '{}',
    scope_gtins           TEXT[] NOT NULL DEFAULT '{}',
    starts_on             DATE NOT NULL DEFAULT CURRENT_DATE,
    ends_on               DATE,
    status                VARCHAR(10) NOT NULL DEFAULT 'ATIVO',   -- ATIVO | ENCERRADO
    contact_name          VARCHAR(120),
    contact_email         VARCHAR(160),
    contact_phone         VARCHAR(30),
    notes                 VARCHAR(1000),
    confirmed_by_distributor_at TIMESTAMP,
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by            VARCHAR(160),
    updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (exclusivity IN ('EXCLUSIVO', 'NAO_EXCLUSIVO')),
    CHECK (status IN ('ATIVO', 'ENCERRADO')),
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX idx_commerce_agreements_industry ON commerce_distribution_agreements (industry_seller_id, status);
CREATE INDEX idx_commerce_agreements_cnpj ON commerce_distribution_agreements (distributor_cnpj);

-- Conta atendida direto pela indústria mesmo em área exclusiva (key account).
-- Por CNPJ: a indústria já conhece os próprios clientes, e nunca fica sabendo
-- por aqui se o CNPJ é cliente do MercadoFlow.
CREATE TABLE commerce_direct_accounts (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry_seller_id UUID NOT NULL REFERENCES commerce_sellers (id) ON DELETE CASCADE,
    cnpj               VARCHAR(14) NOT NULL,
    label              VARCHAR(160),
    created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by         VARCHAR(160),
    UNIQUE (industry_seller_id, cnpj)
);

-- ── Catálogo ───────────────────────────────────────────────────────────────
-- owner = produto da própria indústria (dona do GTIN). Um GTIN tem uma dona só:
-- é sobre ela que valem os acordos de distribuição. Produto de indústria entra
-- PENDENTE até a titularidade ser conferida; de distribuidor entra ATIVO.
CREATE TABLE commerce_seller_products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id       UUID NOT NULL REFERENCES commerce_sellers (id) ON DELETE CASCADE,
    gtin            VARCHAR(14) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    brand           VARCHAR(120),
    owner           BOOLEAN NOT NULL DEFAULT FALSE,
    unit_type       VARCHAR(10) NOT NULL DEFAULT 'UN',            -- como vende: UN, CX, FD...
    units_per_pack  NUMERIC(10,3),
    min_quantity    NUMERIC(14,3) NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
    multiple_of     NUMERIC(14,3) NOT NULL DEFAULT 1 CHECK (multiple_of > 0),
    base_price      NUMERIC(14,4) NOT NULL CHECK (base_price > 0),
    in_stock        BOOLEAN NOT NULL DEFAULT TRUE,
    status          VARCHAR(10) NOT NULL DEFAULT 'ATIVO',         -- PENDENTE | ATIVO | PAUSADO | NEGADO
    status_note     VARCHAR(300),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (seller_id, gtin),
    CHECK (status IN ('PENDENTE', 'ATIVO', 'PAUSADO', 'NEGADO'))
);
CREATE UNIQUE INDEX ux_commerce_product_owner ON commerce_seller_products (gtin) WHERE owner AND status IN ('ATIVO', 'PAUSADO');
CREATE INDEX idx_commerce_products_gtin ON commerce_seller_products (gtin, status);

-- ── Tabelas de preço ───────────────────────────────────────────────────────
-- Vale a tabela vigente de maior prioridade que alcança a loja; sem tabela,
-- vale o preço base do produto. NOMINAL: só lojas listadas que autorizaram.
CREATE TABLE commerce_price_lists (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id     UUID NOT NULL REFERENCES commerce_sellers (id) ON DELETE CASCADE,
    name          VARCHAR(120) NOT NULL,
    priority      INT NOT NULL DEFAULT 0,
    audience      VARCHAR(10) NOT NULL DEFAULT 'TODAS',            -- TODAS | NOMINAL
    scope_ufs     TEXT[] NOT NULL DEFAULT '{}',
    scope_cities  TEXT[] NOT NULL DEFAULT '{}',
    valid_from    DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until   DATE,
    status        VARCHAR(10) NOT NULL DEFAULT 'ATIVA',            -- ATIVA | PAUSADA
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (audience IN ('TODAS', 'NOMINAL')),
    CHECK (status IN ('ATIVA', 'PAUSADA'))
);
CREATE INDEX idx_commerce_price_lists ON commerce_price_lists (seller_id, status);

CREATE TABLE commerce_price_list_markets (
    price_list_id UUID NOT NULL REFERENCES commerce_price_lists (id) ON DELETE CASCADE,
    market_id     UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    PRIMARY KEY (price_list_id, market_id)
);

-- tiers: [{"minQty": 10, "unitPrice": 4.5}], preço por quantidade.
CREATE TABLE commerce_price_list_items (
    price_list_id UUID NOT NULL REFERENCES commerce_price_lists (id) ON DELETE CASCADE,
    gtin          VARCHAR(14) NOT NULL,
    unit_price    NUMERIC(14,4) NOT NULL CHECK (unit_price > 0),
    tiers         JSONB NOT NULL DEFAULT '[]',
    PRIMARY KEY (price_list_id, gtin)
);

-- ── Preferências e autorizações da loja ────────────────────────────────────
CREATE TABLE market_commerce_preferences (
    market_id          UUID PRIMARY KEY REFERENCES markets (id) ON DELETE CASCADE,
    receive_campaigns  BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by         VARCHAR(160)
);

-- AUTORIZADA: o vendedor vê a loja pelo nome e pode mandar campanha e tabela
-- nominais. BLOQUEADA: nada deste vendedor chega à loja.
CREATE TABLE market_seller_consents (
    market_id    UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    seller_id    UUID NOT NULL REFERENCES commerce_sellers (id) ON DELETE CASCADE,
    status       VARCHAR(12) NOT NULL,
    changed_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    changed_by   VARCHAR(160),
    PRIMARY KEY (market_id, seller_id),
    CHECK (status IN ('AUTORIZADA', 'BLOQUEADA'))
);
CREATE INDEX idx_market_seller_consents_seller ON market_seller_consents (seller_id, status);

-- ── Campanhas ──────────────────────────────────────────────────────────────
CREATE SEQUENCE commerce_campaign_number_seq;

CREATE TABLE commerce_campaigns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id        UUID NOT NULL REFERENCES commerce_sellers (id) ON DELETE CASCADE,
    number           VARCHAR(20) NOT NULL UNIQUE,
    title            VARCHAR(120) NOT NULL,
    message          VARCHAR(2000),
    target_type      VARCHAR(10) NOT NULL,                        -- PUBLICO | NOMINAL
    -- PUBLICO: {"ufs": [], "cities": [], "audience": "TODAS|VENDEM|NAO_VENDEM|RUPTURA"}
    target           JSONB NOT NULL DEFAULT '{}',
    valid_from       DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until      DATE NOT NULL,
    status           VARCHAR(10) NOT NULL DEFAULT 'RASCUNHO',     -- RASCUNHO | ENVIADA | ENCERRADA | CANCELADA
    -- Contagens da entrega por canal e motivo, sem identificar loja.
    stats            JSONB,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by       VARCHAR(160),
    sent_at          TIMESTAMP,
    closed_at        TIMESTAMP,
    CHECK (target_type IN ('PUBLICO', 'NOMINAL')),
    CHECK (status IN ('RASCUNHO', 'ENVIADA', 'ENCERRADA', 'CANCELADA')),
    CHECK (valid_until >= valid_from)
);
CREATE INDEX idx_commerce_campaigns ON commerce_campaigns (seller_id, created_at DESC);

CREATE TABLE commerce_campaign_items (
    campaign_id   UUID NOT NULL REFERENCES commerce_campaigns (id) ON DELETE CASCADE,
    gtin          VARCHAR(14) NOT NULL,
    unit_price    NUMERIC(14,4) NOT NULL CHECK (unit_price > 0),
    min_quantity  NUMERIC(14,3) NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
    PRIMARY KEY (campaign_id, gtin)
);

CREATE TABLE commerce_campaign_targets (
    campaign_id  UUID NOT NULL REFERENCES commerce_campaigns (id) ON DELETE CASCADE,
    market_id    UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, market_id)
);

-- Uma linha por loja que recebeu. channel_reason explica a decisão do motor
-- para a loja e o superadmin; o vendedor só vê contagens até a loja pedir.
-- fulfilling_seller_id: quem atende (o próprio vendedor, ou o distribuidor da
-- área quando ele está na plataforma). Distribuidor fora da plataforma fica só
-- com CNPJ e nome, e o pedido vira rascunho no módulo de fornecedores da loja.
CREATE TABLE commerce_campaign_deliveries (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id           UUID NOT NULL REFERENCES commerce_campaigns (id) ON DELETE CASCADE,
    seller_id             UUID NOT NULL REFERENCES commerce_sellers (id) ON DELETE CASCADE,
    market_id             UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    channel               VARCHAR(12) NOT NULL,                   -- DIRETO | DISTRIBUIDOR
    fulfilling_seller_id  UUID REFERENCES commerce_sellers (id) ON DELETE SET NULL,
    distributor_cnpj      VARCHAR(14),
    distributor_name      VARCHAR(160),
    channel_reason        VARCHAR(300) NOT NULL,
    status                VARCHAR(10) NOT NULL DEFAULT 'ENTREGUE', -- ENTREGUE | VISTA | PEDIDO | RECUSADA
    delivered_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    seen_at               TIMESTAMP,
    decided_at            TIMESTAMP,
    decided_by            VARCHAR(160),
    refuse_reason         VARCHAR(300),
    UNIQUE (campaign_id, market_id),
    CHECK (channel IN ('DIRETO', 'DISTRIBUIDOR')),
    CHECK (status IN ('ENTREGUE', 'VISTA', 'PEDIDO', 'RECUSADA'))
);
CREATE INDEX idx_commerce_deliveries_market ON commerce_campaign_deliveries (market_id, delivered_at DESC);
CREATE INDEX idx_commerce_deliveries_campaign ON commerce_campaign_deliveries (campaign_id, status);

-- ── Pedidos ────────────────────────────────────────────────────────────────
CREATE SEQUENCE commerce_order_number_seq;

CREATE TABLE commerce_orders (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number             VARCHAR(20) NOT NULL UNIQUE,
    market_id          UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    seller_id          UUID NOT NULL REFERENCES commerce_sellers (id),
    -- Campanha que deu o preço; campaign_seller_id é quem publicou (a indústria,
    -- quando o pedido foi atendido pelo distribuidor).
    campaign_id        UUID REFERENCES commerce_campaigns (id) ON DELETE SET NULL,
    campaign_seller_id UUID REFERENCES commerce_sellers (id) ON DELETE SET NULL,
    channel            VARCHAR(12) NOT NULL DEFAULT 'DIRETO',
    status             VARCHAR(12) NOT NULL DEFAULT 'ENVIADO',
    total_cents        BIGINT NOT NULL DEFAULT 0,
    payment_terms      VARCHAR(300),
    delivery_terms     VARCHAR(300),
    notes              VARCHAR(1000),
    status_reason      VARCHAR(300),
    nfe_number         VARCHAR(20),
    nfe_key            VARCHAR(44),
    -- Taxa do MercadoFlow, fixada quando o pedido é entregue.
    order_fee_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
    fee_cents          BIGINT,
    supplier_order_id  UUID REFERENCES supplier_orders (id) ON DELETE SET NULL,
    created_by         VARCHAR(160),
    created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    confirmed_at       TIMESTAMP,
    invoiced_at        TIMESTAMP,
    delivered_at       TIMESTAMP,
    CHECK (status IN ('ENVIADO', 'CONFIRMADO', 'FATURADO', 'ENTREGUE', 'RECUSADO', 'CANCELADO')),
    CHECK (channel IN ('DIRETO', 'DISTRIBUIDOR'))
);
CREATE INDEX idx_commerce_orders_market ON commerce_orders (market_id, created_at DESC);
CREATE INDEX idx_commerce_orders_seller ON commerce_orders (seller_id, status, created_at DESC);
CREATE INDEX idx_commerce_orders_campaign ON commerce_orders (campaign_id) WHERE campaign_id IS NOT NULL;

CREATE TABLE commerce_order_items (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id           UUID NOT NULL REFERENCES commerce_orders (id) ON DELETE CASCADE,
    gtin               VARCHAR(14) NOT NULL,
    name               VARCHAR(200) NOT NULL,
    unit_type          VARCHAR(10) NOT NULL DEFAULT 'UN',
    units_per_pack     NUMERIC(10,3),
    quantity           NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    quantity_confirmed NUMERIC(14,3),
    unit_price         NUMERIC(14,4) NOT NULL,
    price_source       VARCHAR(12) NOT NULL,                      -- BASE | TABELA | CAMPANHA
    subtotal_cents     BIGINT NOT NULL
);
CREATE INDEX idx_commerce_order_items ON commerce_order_items (order_id);

CREATE TABLE commerce_order_events (
    id          BIGSERIAL PRIMARY KEY,
    order_id    UUID NOT NULL REFERENCES commerce_orders (id) ON DELETE CASCADE,
    actor       VARCHAR(160),
    actor_side  VARCHAR(10) NOT NULL,                              -- LOJA | VENDEDOR | SISTEMA
    from_status VARCHAR(12),
    to_status   VARCHAR(12) NOT NULL,
    note        VARCHAR(500),
    at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_commerce_order_events ON commerce_order_events (order_id, at);

-- ── Auditoria do vendedor ──────────────────────────────────────────────────
CREATE TABLE commerce_events (
    id         BIGSERIAL PRIMARY KEY,
    seller_id  UUID REFERENCES commerce_sellers (id) ON DELETE CASCADE,
    actor      VARCHAR(160),
    action     VARCHAR(40) NOT NULL,
    detail     JSONB,
    at         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_commerce_events ON commerce_events (seller_id, action, at);

-- ── Isolamento ─────────────────────────────────────────────────────────────
-- Lado da loja: cada mercado só vê o que é dele. O portal de vendas e o
-- superadmin leem como sistema e filtram pelo vendedor no serviço.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['market_commerce_preferences', 'market_seller_consents', 'commerce_campaign_deliveries', 'commerce_orders']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING ('
            'current_setting(''app.is_admin'', true) = ''true'' '
            'OR market_id = NULLIF(current_setting(''app.current_market'', true), '''')::uuid)', t);
    END LOOP;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON commerce_sellers, commerce_distribution_agreements, '
            'commerce_direct_accounts, commerce_seller_products, commerce_price_lists, commerce_price_list_markets, '
            'commerce_price_list_items, market_commerce_preferences, market_seller_consents, commerce_campaigns, '
            'commerce_campaign_items, commerce_campaign_targets, commerce_campaign_deliveries, commerce_orders, '
            'commerce_order_items, commerce_order_events, commerce_events TO mercadoflow_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE commerce_campaign_number_seq, commerce_order_number_seq, '
            'commerce_order_events_id_seq, commerce_events_id_seq TO mercadoflow_app';
    END IF;
END $$;
