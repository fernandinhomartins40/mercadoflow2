-- MercadoFlow Indústria (docs/PROPOSTA-INDUSTRIA.md).
--
-- A indústria vê o giro dos produtos DELA por UF, cidade e bairro, sem saber
-- qual mercado vendeu e sem ver produto de concorrente. Três barreiras, cada
-- uma suficiente sozinha para conter um erro nas outras:
--
--  1. Os agregados (mf_sellout_*) não têm coluna de mercado, PDV, nota ou
--     cliente: o job descarta a loja antes de gravar.
--  2. RLS nos agregados: fora do superadmin, só passa célula publicada de GTIN
--     aprovado na carteira da indústria da sessão, dentro da área do contrato.
--  3. A API da indústria consulta sob SET LOCAL ROLE mf_industry_reader, papel
--     que só tem SELECT nos agregados: nem um bug alcança invoices.

-- ── Participação das lojas ─────────────────────────────────────────────────
-- Plano Grátis participa sempre; plano pago participa por padrão e pode sair.
CREATE TABLE market_data_participation (
    market_id     UUID PRIMARY KEY REFERENCES markets (id) ON DELETE CASCADE,
    status        VARCHAR(12) NOT NULL DEFAULT 'PARTICIPA',   -- PARTICIPA | SAIU
    reason        VARCHAR(300),
    terms_version VARCHAR(20),
    changed_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    changed_by    VARCHAR(160)
);

-- Origem do endereço: NFCE_EMIT (emitente da NFC-e do caixa) e MANUAL (superadmin)
-- se somam ao NFE_DEST do Confere.
ALTER TABLE market_locations ALTER COLUMN source TYPE VARCHAR(16);

-- ── Política de privacidade (uma linha, editável e auditada) ─────────────────
CREATE TABLE mf_privacy_policy (
    id                        VARCHAR(16) PRIMARY KEY,
    min_stores_per_cell       INT NOT NULL DEFAULT 3,
    max_store_share           NUMERIC(4,3) NOT NULL DEFAULT 0.700,
    secondary_suppression     BOOLEAN NOT NULL DEFAULT TRUE,
    neighborhood_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    hourly_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
    publish_delay_minutes     INT NOT NULL DEFAULT 120,
    category_min_brands       INT NOT NULL DEFAULT 5,
    category_max_brand_share  NUMERIC(4,3) NOT NULL DEFAULT 0.600,
    max_queries_per_day       INT NOT NULL DEFAULT 2000,
    updated_at                TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by                VARCHAR(160)
);
INSERT INTO mf_privacy_policy (id) VALUES ('default');

CREATE TABLE mf_privacy_policy_history (
    id          BIGSERIAL PRIMARY KEY,
    changed_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    changed_by  VARCHAR(160),
    loosened    BOOLEAN NOT NULL,
    before      JSONB NOT NULL,
    after       JSONB NOT NULL
);

-- ── Agregados de venda (sell-out) ───────────────────────────────────────────
-- level: BAIRRO | CIDADE | UF. city_code '*' no nível UF; neighborhood '*' em
-- CIDADE e UF. Célula não publicada guarda só o motivo e o número de lojas
-- (para a prévia do superadmin); as métricas ficam nulas.
CREATE TABLE mf_sellout_weekly (
    week_start      DATE NOT NULL,
    gtin            VARCHAR(14) NOT NULL,
    level           VARCHAR(8) NOT NULL,
    uf              VARCHAR(2) NOT NULL,
    region          VARCHAR(12) NOT NULL,
    city_code       VARCHAR(7) NOT NULL,
    city            VARCHAR(80),
    neighborhood    VARCHAR(80) NOT NULL,
    published       BOOLEAN NOT NULL,
    suppress_reason VARCHAR(16),
    stores          INT NOT NULL,
    universe        INT,
    units           NUMERIC(18,3),
    revenue         NUMERIC(18,2),
    promo_units     NUMERIC(18,3),
    min_price       NUMERIC(14,4),
    avg_price       NUMERIC(14,4),
    max_price       NUMERIC(14,4),
    refreshed_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (week_start, gtin, uf, city_code, neighborhood)
);
CREATE INDEX idx_mf_sow_gtin ON mf_sellout_weekly (gtin, level, week_start);

CREATE TABLE mf_sellout_daily (
    day             DATE NOT NULL,
    gtin            VARCHAR(14) NOT NULL,
    level           VARCHAR(8) NOT NULL,
    uf              VARCHAR(2) NOT NULL,
    region          VARCHAR(12) NOT NULL,
    city_code       VARCHAR(7) NOT NULL,
    city            VARCHAR(80),
    neighborhood    VARCHAR(80) NOT NULL,
    published       BOOLEAN NOT NULL,
    suppress_reason VARCHAR(16),
    stores          INT NOT NULL,
    universe        INT,
    units           NUMERIC(18,3),
    revenue         NUMERIC(18,2),
    promo_units     NUMERIC(18,3),
    min_price       NUMERIC(14,4),
    avg_price       NUMERIC(14,4),
    max_price       NUMERIC(14,4),
    refreshed_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (day, gtin, uf, city_code, neighborhood)
);
CREATE INDEX idx_mf_sod_gtin ON mf_sellout_daily (gtin, level, day);

-- Por hora só CIDADE e UF: hora no bairro casaria com o movimento de uma loja.
CREATE TABLE mf_sellout_hourly (
    hour            TIMESTAMP NOT NULL,
    gtin            VARCHAR(14) NOT NULL,
    level           VARCHAR(8) NOT NULL,
    uf              VARCHAR(2) NOT NULL,
    region          VARCHAR(12) NOT NULL,
    city_code       VARCHAR(7) NOT NULL,
    city            VARCHAR(80),
    published       BOOLEAN NOT NULL,
    suppress_reason VARCHAR(16),
    stores          INT NOT NULL,
    units           NUMERIC(18,3),
    revenue         NUMERIC(18,2),
    refreshed_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (hour, gtin, uf, city_code)
);
CREATE INDEX idx_mf_soh_gtin ON mf_sellout_hourly (gtin, level, hour);

-- Possível ruptura: lojas que venderam o GTIN nas 4 semanas anteriores e não
-- venderam nesta. Só contagem de lojas, publicada com o mínimo de lojas.
CREATE TABLE mf_rupture_weekly (
    week_start      DATE NOT NULL,
    gtin            VARCHAR(14) NOT NULL,
    level           VARCHAR(8) NOT NULL,
    uf              VARCHAR(2) NOT NULL,
    region          VARCHAR(12) NOT NULL,
    city_code       VARCHAR(7) NOT NULL,
    city            VARCHAR(80),
    published       BOOLEAN NOT NULL,
    stores_before   INT NOT NULL,
    stores_now      INT NOT NULL,
    stores_stopped  INT NOT NULL,
    refreshed_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (week_start, gtin, uf, city_code)
);

-- Participação na categoria: só a % do GTIN no total da categoria, sem nome
-- nem número de outro produto. Publicada com mínimo de marcas e sem marca dominante.
CREATE TABLE mf_category_share_weekly (
    week_start      DATE NOT NULL,
    gtin            VARCHAR(14) NOT NULL,
    category        VARCHAR(120) NOT NULL,
    level           VARCHAR(8) NOT NULL,
    uf              VARCHAR(2) NOT NULL,
    region          VARCHAR(12) NOT NULL,
    city_code       VARCHAR(7) NOT NULL,
    city            VARCHAR(80),
    published       BOOLEAN NOT NULL,
    suppress_reason VARCHAR(16),
    brands          INT NOT NULL,
    share_pct       NUMERIC(7,3),
    refreshed_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (week_start, gtin, uf, city_code)
);

-- Cobertura: lojas participantes com endereço e venda nos últimos 30 dias.
CREATE TABLE mf_coverage (
    level        VARCHAR(8) NOT NULL,
    uf           VARCHAR(2) NOT NULL,
    region       VARCHAR(12) NOT NULL,
    city_code    VARCHAR(7) NOT NULL,
    city         VARCHAR(80),
    published    BOOLEAN NOT NULL,
    stores       INT NOT NULL,
    refreshed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (uf, city_code)
);

CREATE TABLE mf_aggregation_runs (
    id           BIGSERIAL PRIMARY KEY,
    kind         VARCHAR(16) NOT NULL,     -- SELLOUT | HOURLY
    started_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at  TIMESTAMP,
    from_day     DATE,
    to_day       DATE,
    published    INT,
    suppressed   INT,
    stores       INT,
    error        VARCHAR(500)
);

-- ── Indústrias, carteira e contratos ───────────────────────────────────────
CREATE TABLE industries (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cnpj              VARCHAR(14) NOT NULL UNIQUE,
    legal_name        VARCHAR(160) NOT NULL,
    trade_name        VARCHAR(120),
    status            VARCHAR(12) NOT NULL DEFAULT 'EM_ANALISE',  -- EM_ANALISE | ATIVA | SUSPENSA | ENCERRADA
    status_reason     VARCHAR(300),
    gs1_prefixes      TEXT[] NOT NULL DEFAULT '{}',
    brands            TEXT[] NOT NULL DEFAULT '{}',
    contact_name      VARCHAR(120),
    contact_email     VARCHAR(160),
    contact_phone     VARCHAR(30),
    notes             TEXT,
    asaas_customer_id VARCHAR(40),
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE users
    ADD CONSTRAINT fk_users_industry FOREIGN KEY (industry_id) REFERENCES industries (id) ON DELETE SET NULL;

CREATE TABLE industry_portfolio (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry_id           UUID NOT NULL REFERENCES industries (id) ON DELETE CASCADE,
    gtin                  VARCHAR(14) NOT NULL,
    product_name          VARCHAR(200),
    brand                 VARCHAR(120),
    status                VARCHAR(10) NOT NULL DEFAULT 'PEDIDO',   -- PEDIDO | APROVADO | NEGADO | REVOGADO
    classification        VARCHAR(10),                              -- VERDE | AMARELO | VERMELHO
    classification_reason VARCHAR(200),
    evidence_type         VARCHAR(16),                              -- PREFIXO_GS1 | DOCUMENTO | LICENCA
    evidence_ref          VARCHAR(300),
    requested_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    requested_by          VARCHAR(160),
    decided_at            TIMESTAMP,
    decided_by            VARCHAR(160),
    decision_note         VARCHAR(300),
    approved_at           TIMESTAMP,
    revoked_at            TIMESTAMP,
    -- Quando o histórico deste GTIN foi agregado (null = o job ainda precisa fazer).
    aggregated_at         TIMESTAMP,
    UNIQUE (industry_id, gtin)
);
-- Um GTIN aprovado pertence a uma indústria só: é o que impede ver o concorrente.
CREATE UNIQUE INDEX ux_industry_portfolio_gtin_approved ON industry_portfolio (gtin) WHERE status = 'APROVADO';
CREATE INDEX idx_industry_portfolio_status ON industry_portfolio (industry_id, status);

CREATE TABLE industry_plans (
    code                 VARCHAR(12) PRIMARY KEY,
    name                 VARCHAR(40) NOT NULL,
    description          VARCHAR(300) NOT NULL,
    base_fee_cents       INT NOT NULL,
    price_per_gtin_cents INT NOT NULL,
    features             TEXT[] NOT NULL,
    max_ufs              INT,          -- NULL = sem limite (nacional)
    max_cities           INT,
    sort_order           INT NOT NULL DEFAULT 0
);
INSERT INTO industry_plans VALUES
 ('ESSENCIAL', 'Essencial', 'Venda, preço praticado e possível ruptura em até 3 cidades.',
  150000, 6000, '{SELLOUT,PRECO,RUPTURA}', 0, 3, 1),
 ('REGIONAL', 'Regional', 'Tudo do Essencial, mais promoções, entradas (sell-in) e venda por hora, em até 3 UFs.',
  400000, 4500, '{SELLOUT,PRECO,RUPTURA,PROMO,SELLIN,HORA}', 3, NULL, 2),
 ('NACIONAL', 'Nacional', 'Tudo do Regional no Brasil inteiro, mais participação na categoria e exportação.',
  900000, 3500, '{SELLOUT,PRECO,RUPTURA,PROMO,SELLIN,HORA,CATEGORIA,EXPORTACAO}', NULL, NULL, 3);

CREATE SEQUENCE industry_contract_number_seq;

CREATE TABLE industry_contracts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry_id           UUID NOT NULL REFERENCES industries (id) ON DELETE CASCADE,
    number                VARCHAR(20) NOT NULL UNIQUE,
    plan                  VARCHAR(12) NOT NULL REFERENCES industry_plans (code),
    features              TEXT[] NOT NULL,
    scope_ufs             TEXT[] NOT NULL DEFAULT '{}',
    scope_cities          TEXT[] NOT NULL DEFAULT '{}',   -- códigos IBGE
    allow_neighborhood    BOOLEAN NOT NULL DEFAULT TRUE,
    gtin_limit            INT NOT NULL,
    base_fee_cents        INT NOT NULL,
    price_per_gtin_cents  INT NOT NULL,
    discount_pct          NUMERIC(5,2) NOT NULL DEFAULT 0,
    billing_day           INT NOT NULL DEFAULT 10,
    starts_on             DATE NOT NULL,
    ends_on               DATE NOT NULL,
    status                VARCHAR(10) NOT NULL DEFAULT 'RASCUNHO',  -- RASCUNHO | ATIVO | SUSPENSO | ENCERRADO
    status_reason         VARCHAR(300),
    signed_document_ref   VARCHAR(300),
    preview_approved_at   TIMESTAMP,
    preview_approved_by   VARCHAR(160),
    activated_at          TIMESTAMP,
    notes                 TEXT,
    created_by            VARCHAR(160),
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (ends_on >= starts_on)
);
CREATE INDEX idx_industry_contracts_industry ON industry_contracts (industry_id, status);
-- Um contrato vigente por indústria.
CREATE UNIQUE INDEX ux_industry_contract_active ON industry_contracts (industry_id) WHERE status IN ('ATIVO', 'SUSPENSO');

CREATE TABLE industry_invoices (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id      UUID NOT NULL REFERENCES industry_contracts (id) ON DELETE CASCADE,
    industry_id      UUID NOT NULL REFERENCES industries (id) ON DELETE CASCADE,
    month            DATE NOT NULL,
    gtins_billed     INT NOT NULL,
    base_cents       INT NOT NULL,
    gtin_cents       INT NOT NULL,
    discount_cents   INT NOT NULL,
    amount_cents     INT NOT NULL,
    status           VARCHAR(10) NOT NULL DEFAULT 'ABERTA',   -- ABERTA | PAGA | VENCIDA | CANCELADA
    due_date         DATE NOT NULL,
    asaas_payment_id VARCHAR(40),
    invoice_url      VARCHAR(300),
    paid_at          TIMESTAMP,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (contract_id, month)
);

CREATE TABLE industry_access_log (
    id                BIGSERIAL PRIMARY KEY,
    industry_id       UUID NOT NULL REFERENCES industries (id) ON DELETE CASCADE,
    user_email        VARCHAR(160),
    endpoint          VARCHAR(80) NOT NULL,
    filters           JSONB,
    cells_returned    INT NOT NULL DEFAULT 0,
    cells_suppressed  INT NOT NULL DEFAULT 0,
    preview           BOOLEAN NOT NULL DEFAULT FALSE,
    at                TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_industry_access_log ON industry_access_log (industry_id, at);

CREATE TABLE industry_admin_events (
    id          BIGSERIAL PRIMARY KEY,
    industry_id UUID REFERENCES industries (id) ON DELETE CASCADE,
    actor       VARCHAR(160),
    action      VARCHAR(40) NOT NULL,
    detail      JSONB,
    at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_industry_admin_events ON industry_admin_events (industry_id, at);

-- ── Quem pode ver o quê ───────────────────────────────────────────────────
-- SECURITY DEFINER: lê carteira e contrato com o dono do schema, então o papel
-- restrito não precisa (nem tem) acesso a essas tabelas.
-- app.preview_contract: o superadmin vê o contrato em rascunho exatamente como
-- a indústria verá; só o código do servidor grava esse valor.
CREATE OR REPLACE FUNCTION mf_industry_can_see(p_gtin TEXT, p_level TEXT, p_uf TEXT, p_city_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1
        FROM industries i
        JOIN industry_contracts c ON c.industry_id = i.id
        JOIN industry_portfolio p ON p.industry_id = i.id AND p.status = 'APROVADO' AND p.gtin = p_gtin
        WHERE i.id = NULLIF(current_setting('app.current_industry', true), '')::uuid
          AND (
                (i.status = 'ATIVA' AND c.status = 'ATIVO' AND CURRENT_DATE BETWEEN c.starts_on AND c.ends_on)
             OR c.id = NULLIF(current_setting('app.preview_contract', true), '')::uuid
          )
          AND (
                (cardinality(c.scope_ufs) = 0 AND cardinality(c.scope_cities) = 0)
             OR p_uf = ANY (c.scope_ufs)
             OR (p_level <> 'UF' AND p_city_code = ANY (c.scope_cities))
          )
          AND (p_level <> 'BAIRRO' OR c.allow_neighborhood)
    )
$$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['mf_sellout_weekly', 'mf_sellout_daily', 'mf_sellout_hourly', 'mf_rupture_weekly', 'mf_category_share_weekly']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS industry_isolation ON %I', t);
        EXECUTE format(
            'CREATE POLICY industry_isolation ON %I FOR ALL USING ('
            'current_setting(''app.is_admin'', true) = ''true'' '
            'OR (published AND mf_industry_can_see(gtin, level, uf, city_code)))', t);
    END LOOP;
END $$;

-- Sell-in (Confere) entra no mesmo funil para o pacote com entradas.
ALTER TABLE mf_sellin_weekly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS industry_isolation ON mf_sellin_weekly;
CREATE POLICY industry_isolation ON mf_sellin_weekly FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR mf_industry_can_see(gtin, level, uf, city_code));

ALTER TABLE mf_coverage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS industry_isolation ON mf_coverage;
CREATE POLICY industry_isolation ON mf_coverage FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR (published AND NULLIF(current_setting('app.current_industry', true), '') IS NOT NULL));

ALTER TABLE market_data_participation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON market_data_participation;
CREATE POLICY tenant_isolation ON market_data_participation FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid);

-- ── Papel restrito da API da indústria ─────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mf_industry_reader') THEN
        EXECUTE 'CREATE ROLE mf_industry_reader NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE';
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO mf_industry_reader;
GRANT SELECT ON mf_sellout_weekly, mf_sellout_daily, mf_sellout_hourly, mf_rupture_weekly,
    mf_category_share_weekly, mf_sellin_weekly, mf_coverage TO mf_industry_reader;
GRANT EXECUTE ON FUNCTION mf_industry_can_see(TEXT, TEXT, TEXT, TEXT) TO mf_industry_reader;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        -- A aplicação entra no papel restrito com SET LOCAL ROLE.
        EXECUTE 'GRANT mf_industry_reader TO mercadoflow_app';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON market_data_participation, mf_privacy_policy, '
            'mf_privacy_policy_history, mf_sellout_weekly, mf_sellout_daily, mf_sellout_hourly, mf_rupture_weekly, '
            'mf_category_share_weekly, mf_coverage, mf_aggregation_runs, industries, industry_portfolio, industry_plans, '
            'industry_contracts, industry_invoices, industry_access_log, industry_admin_events TO mercadoflow_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE industry_contract_number_seq, mf_privacy_policy_history_id_seq, '
            'mf_aggregation_runs_id_seq, industry_access_log_id_seq, industry_admin_events_id_seq TO mercadoflow_app';
    END IF;
END $$;
