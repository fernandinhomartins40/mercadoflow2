-- Confere: base de dados das notas de entrada (sell-in) para não perder nada e
-- para, no futuro, o produto de desempenho de produtos para fabricantes.
--
-- Três camadas:
--   1. Dado do mercado (RLS): itens de cada nota, entradas de estoque confirmadas
--      na conferência, localização do mercado (vinda do endereço de destino da nota).
--   2. Referência pública: fornecedores (CNPJ, nome, cidade — dado de empresa).
--   3. Agregado da plataforma (sem market_id): produto × semana × local, só com
--      células de pelo menos N lojas (N configurável). O mercado só é identificado
--      para fabricantes se ele mesmo optar (manufacturer_visibility).

-- ── Camada 1: mercado ─────────────────────────────────────────────────────

ALTER TABLE nfe_documents
    ADD COLUMN IF NOT EXISTS items_extracted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS supplier_uf VARCHAR(2),
    ADD COLUMN IF NOT EXISTS supplier_city VARCHAR(80);

CREATE TABLE nfe_document_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id           UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    document_id         UUID NOT NULL REFERENCES nfe_documents (id) ON DELETE CASCADE,
    item_number         INT NOT NULL,
    supplier_cnpj       VARCHAR(14),
    issued_at           TIMESTAMP,
    -- GTIN da unidade de venda (cEANTrib) e da embalagem de compra (cEAN), quando existem.
    gtin                VARCHAR(14),
    box_gtin            VARCHAR(14),
    product_id          UUID REFERENCES products (id) ON DELETE SET NULL,
    supplier_code       VARCHAR(60),
    description         VARCHAR(160),
    ncm                 VARCHAR(8),
    cfop                VARCHAR(4),
    unit                VARCHAR(6),
    quantity            NUMERIC(15,4),
    unit_price          NUMERIC(15,6),
    total               NUMERIC(15,2),
    discount            NUMERIC(15,2),
    tax_unit            VARCHAR(6),
    tax_quantity        NUMERIC(15,4),
    -- Custo de uma unidade de venda (vProd ÷ qTrib): a medida que compara notas.
    unit_cost           NUMERIC(15,6),
    lot                 VARCHAR(40),
    expiry              DATE,
    CONSTRAINT uq_nfe_items_doc_item UNIQUE (document_id, item_number)
);
CREATE INDEX idx_nfe_items_market_gtin ON nfe_document_items (market_id, gtin, issued_at DESC);
CREATE INDEX idx_nfe_items_gtin_date ON nfe_document_items (gtin, issued_at);

-- Entradas de estoque: o que a conferência confirmou que chegou (em unidades de venda).
CREATE TABLE confere_stock_entries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id        UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    document_id      UUID NOT NULL REFERENCES nfe_documents (id) ON DELETE CASCADE,
    check_id         UUID NOT NULL REFERENCES confere_checks (id) ON DELETE CASCADE,
    item_number      INT NOT NULL,
    product_id       UUID REFERENCES products (id) ON DELETE SET NULL,
    gtin             VARCHAR(14),
    description      VARCHAR(160),
    expected_units   NUMERIC(15,4),
    received_units   NUMERIC(15,4),
    unit_cost        NUMERIC(15,6),
    issue            VARCHAR(12),
    received_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_stock_entry_check_item UNIQUE (check_id, item_number)
);
CREATE INDEX idx_stock_entries_market ON confere_stock_entries (market_id, received_at DESC);

-- Onde fica o mercado (vem do endereço de destino das notas que ele recebe).
CREATE TABLE market_locations (
    market_id     UUID PRIMARY KEY REFERENCES markets (id) ON DELETE CASCADE,
    street        VARCHAR(120),
    number        VARCHAR(20),
    neighborhood  VARCHAR(80),
    city          VARCHAR(80),
    city_code     VARCHAR(7),
    uf            VARCHAR(2),
    postal_code   VARCHAR(8),
    source        VARCHAR(16) NOT NULL DEFAULT 'NFE_DEST',
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE confere_accounts
    ADD COLUMN IF NOT EXISTS manufacturer_visibility BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS manufacturer_visibility_at TIMESTAMP;

-- ── Camada 2: referência pública ──────────────────────────────────────────

CREATE TABLE nfe_suppliers (
    cnpj        VARCHAR(14) PRIMARY KEY,
    name        VARCHAR(200),
    trade_name  VARCHAR(200),
    city        VARCHAR(80),
    city_code   VARCHAR(7),
    uf          VARCHAR(2),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Camada 3: agregado da plataforma (sem mercado) ────────────────────────

ALTER TABLE confere_settings
    ADD COLUMN IF NOT EXISTS min_stores_per_cell INT NOT NULL DEFAULT 3;

-- Produto × semana × local. Nenhuma coluna identifica o mercado. Recalculado
-- pelo job a partir de nfe_document_items. Três níveis que não se somam entre si:
--   BAIRRO (city_code + neighborhood), CIDADE (neighborhood = '*'),
--   UF (city_code = '*' e neighborhood = '*').
-- Uma célula só entra com pelo menos min_stores_per_cell lojas e se nenhuma
-- loja sozinha passar de 70% das unidades (senão daria para deduzir a loja).
CREATE TABLE mf_sellin_weekly (
    week_start    DATE NOT NULL,
    gtin          VARCHAR(14) NOT NULL,
    level         VARCHAR(8) NOT NULL,   -- BAIRRO | CIDADE | UF
    uf            VARCHAR(2) NOT NULL,
    region        VARCHAR(12) NOT NULL,  -- NORTE | NORDESTE | CENTRO-OESTE | SUDESTE | SUL
    city_code     VARCHAR(7) NOT NULL,
    city          VARCHAR(80),
    neighborhood  VARCHAR(80) NOT NULL,
    stores        INT NOT NULL,
    units         NUMERIC(18,4) NOT NULL,
    value         NUMERIC(18,2) NOT NULL,
    min_unit_cost NUMERIC(15,6),
    avg_unit_cost NUMERIC(15,6),
    max_unit_cost NUMERIC(15,6),
    refreshed_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (week_start, gtin, uf, city_code, neighborhood)
);
CREATE INDEX idx_mf_sellin_gtin ON mf_sellin_weekly (gtin, level, week_start);
CREATE INDEX idx_mf_sellin_uf ON mf_sellin_weekly (uf, level, week_start);

-- Tração: unidades das últimas 4 semanas contra as 4 anteriores, por produto e UF.
CREATE OR REPLACE VIEW mf_product_traction AS
SELECT gtin, uf, region,
       SUM(units) FILTER (WHERE week_start > CURRENT_DATE - 28) AS units_4w,
       SUM(units) FILTER (WHERE week_start <= CURRENT_DATE - 28 AND week_start > CURRENT_DATE - 56) AS units_prev_4w,
       MAX(stores) FILTER (WHERE week_start > CURRENT_DATE - 28) AS stores_4w,
       AVG(avg_unit_cost) FILTER (WHERE week_start > CURRENT_DATE - 28) AS avg_cost_4w,
       AVG(avg_unit_cost) FILTER (WHERE week_start <= CURRENT_DATE - 28 AND week_start > CURRENT_DATE - 56) AS avg_cost_prev_4w
FROM mf_sellin_weekly
WHERE level = 'UF' AND week_start > CURRENT_DATE - 56
GROUP BY gtin, uf, region;

-- Sazonalidade: unidades por mês do ano, por produto e UF.
CREATE OR REPLACE VIEW mf_product_seasonality AS
SELECT gtin, uf, EXTRACT(MONTH FROM week_start)::INT AS month, SUM(units) AS units, MAX(stores) AS stores
FROM mf_sellin_weekly
WHERE level = 'UF'
GROUP BY gtin, uf, EXTRACT(MONTH FROM week_start);

-- Custo por região: o mesmo produto em cada cidade nas últimas 8 semanas.
CREATE OR REPLACE VIEW mf_product_city_cost AS
SELECT gtin, uf, city_code, city, SUM(units) AS units, MAX(stores) AS stores,
       MIN(min_unit_cost) AS min_cost, AVG(avg_unit_cost) AS avg_cost, MAX(max_unit_cost) AS max_cost
FROM mf_sellin_weekly
WHERE level = 'CIDADE' AND week_start > CURRENT_DATE - 56
GROUP BY gtin, uf, city_code, city;

-- Lojas que escolheram aparecer para os fabricantes (opt-in, revogável).
-- security_invoker: a view respeita a RLS de quem consulta.
CREATE OR REPLACE VIEW mf_optin_store_sellin WITH (security_invoker = true) AS
SELECT i.market_id, m.name AS market_name, l.uf, l.city, l.neighborhood, i.gtin,
       date_trunc('month', i.issued_at)::date AS month,
       SUM(COALESCE(i.tax_quantity, i.quantity)) AS units, AVG(i.unit_cost) AS avg_unit_cost
FROM nfe_document_items i
JOIN confere_accounts a ON a.market_id = i.market_id AND a.manufacturer_visibility
JOIN markets m ON m.id = i.market_id
LEFT JOIN market_locations l ON l.market_id = i.market_id
WHERE i.gtin IS NOT NULL
GROUP BY i.market_id, m.name, l.uf, l.city, l.neighborhood, i.gtin, date_trunc('month', i.issued_at);

-- ── RLS e permissões ──────────────────────────────────────────────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['nfe_document_items', 'confere_stock_entries', 'market_locations']
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
DECLARE
    app_role TEXT := 'mercadoflow_app';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON nfe_document_items, confere_stock_entries, market_locations, '
            'nfe_suppliers, mf_sellin_weekly TO %I', app_role);
        EXECUTE format('GRANT SELECT ON mf_product_traction, mf_product_seasonality, mf_product_city_cost, mf_optin_store_sellin TO %I', app_role);
    END IF;
END $$;
