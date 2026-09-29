-- MercadoFlow Confere: PWA gratuito de conferência de mercadoria pela nota
-- fiscal do fornecedor (DANFE). Porta de entrada do MercadoFlow.
--
-- De onde vem a nota:
--   1. certificado A1 do mercado → Sefaz (distribuição de DF-e), grátis;
--   2. créditos de leitura → API do Meu Danfe pela chave (a plataforma revende);
--   3. XML enviado pelo próprio usuário.
-- Toda nota obtida fica guardada (o mercado aceita isso nos termos).

-- ── Plataforma (sem tenant) ─────────────────────────────────────────────────

CREATE TABLE confere_settings (
    id                     VARCHAR(16) PRIMARY KEY,
    enabled                BOOLEAN NOT NULL DEFAULT TRUE,
    -- Chave da API do Meu Danfe, cifrada (AES-GCM, mesma chave mestra do BYOK).
    meudanfe_api_key_enc   TEXT,
    meudanfe_key_hint      VARCHAR(8),
    -- Preço avulso de uma leitura, em centavos.
    price_per_read_cents   INT NOT NULL DEFAULT 6,
    trial_reads            INT NOT NULL DEFAULT 15,
    terms_version          VARCHAR(20) NOT NULL DEFAULT '2026-09-29',
    terms_text             TEXT,
    -- Pix direto na chave da plataforma (confirmação manual no painel).
    pix_key                VARCHAR(120),
    pix_merchant_name      VARCHAR(25),
    pix_merchant_city      VARCHAR(15),
    stripe_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at             TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by             VARCHAR(255)
);

INSERT INTO confere_settings (id) VALUES ('default');

CREATE TABLE confere_plans (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(60) NOT NULL,
    reads        INT NOT NULL CHECK (reads > 0),
    price_cents  INT NOT NULL CHECK (price_cents > 0),
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO confere_plans (name, reads, price_cents, sort_order) VALUES
    ('Pacote 100 notas', 100, 590, 1),
    ('Pacote 500 notas', 500, 2490, 2),
    ('Pacote 1.000 notas', 1000, 4490, 3);

-- ── Mercado (com tenant) ────────────────────────────────────────────────────

CREATE TABLE confere_accounts (
    market_id               UUID PRIMARY KEY REFERENCES markets (id) ON DELETE CASCADE,
    terms_version           VARCHAR(20),
    terms_accepted_at       TIMESTAMP,
    terms_accepted_by       VARCHAR(255),
    balance                 INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    trial_granted           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Extrato de leituras: todo crédito e débito, para conferir saldo e cobrança.
CREATE TABLE confere_ledger (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id   UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    delta       INT NOT NULL,
    kind        VARCHAR(16) NOT NULL,   -- TRIAL | PURCHASE | READ | REFUND | ADJUST
    reference   VARCHAR(80),
    note        VARCHAR(240),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_confere_ledger_market ON confere_ledger (market_id, created_at DESC);

CREATE TABLE confere_orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id           UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    plan_id             UUID REFERENCES confere_plans (id) ON DELETE SET NULL,
    reads               INT NOT NULL CHECK (reads > 0),
    amount_cents        INT NOT NULL CHECK (amount_cents > 0),
    method              VARCHAR(16) NOT NULL,  -- PIX | STRIPE
    status              VARCHAR(16) NOT NULL DEFAULT 'PENDING', -- PENDING | PAID | CANCELED
    txid                VARCHAR(25) NOT NULL,
    stripe_session_id   VARCHAR(120),
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    paid_at             TIMESTAMP,
    confirmed_by        VARCHAR(255),
    CONSTRAINT uq_confere_orders_txid UNIQUE (txid)
);
CREATE INDEX idx_confere_orders_market ON confere_orders (market_id, created_at DESC);
CREATE INDEX idx_confere_orders_status ON confere_orders (status, created_at DESC);

-- Certificado A1 do mercado: arquivo .pfx e senha cifrados.
CREATE TABLE confere_certificates (
    market_id       UUID PRIMARY KEY REFERENCES markets (id) ON DELETE CASCADE,
    pfx_enc         TEXT NOT NULL,
    password_enc    TEXT NOT NULL,
    cnpj            VARCHAR(14) NOT NULL,
    uf_code         VARCHAR(2) NOT NULL,
    holder          VARCHAR(200),
    not_after       TIMESTAMP NOT NULL,
    last_nsu        VARCHAR(15) NOT NULL DEFAULT '000000000000000',
    last_sync_at    TIMESTAMP,
    next_sync_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    last_status     VARCHAR(240),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_confere_cert_next ON confere_certificates (next_sync_at);

-- Notas obtidas (XML completo ou só o resumo, à espera da ciência da operação).
CREATE TABLE nfe_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id       UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    access_key      VARCHAR(44) NOT NULL,
    source          VARCHAR(12) NOT NULL,  -- SEFAZ | MEUDANFE | UPLOAD
    completeness    VARCHAR(8) NOT NULL,   -- FULL | SUMMARY
    xml             TEXT,
    emitter_cnpj    VARCHAR(14),
    emitter_name    VARCHAR(200),
    number          VARCHAR(12),
    series          VARCHAR(5),
    issued_at       TIMESTAMP,
    total_value     NUMERIC(15,2),
    items_count     INT,
    volumes         INT,
    acknowledged    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_nfe_documents_market_key UNIQUE (market_id, access_key)
);
CREATE INDEX idx_nfe_documents_market ON nfe_documents (market_id, issued_at DESC NULLS LAST);

-- Conferências feitas no PWA.
CREATE TABLE confere_checks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id     UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    document_id   UUID NOT NULL REFERENCES nfe_documents (id) ON DELETE CASCADE,
    status        VARCHAR(12) NOT NULL DEFAULT 'OPEN',  -- OPEN | DONE
    blind         BOOLEAN NOT NULL DEFAULT FALSE,
    -- {"<nItem>": {"counted": 10, "issue": "AVARIA", "note": "..."}}
    counts        JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary       JSONB,
    started_by    VARCHAR(255),
    finished_by   VARCHAR(255),
    started_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at   TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_confere_checks_doc ON confere_checks (document_id, started_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['confere_accounts', 'confere_ledger', 'confere_orders', 'confere_certificates',
                             'nfe_documents', 'confere_checks']
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
            'GRANT SELECT, INSERT, UPDATE, DELETE ON confere_settings, confere_plans, confere_accounts, '
            'confere_ledger, confere_orders, confere_certificates, nfe_documents, confere_checks TO %I', app_role);
    END IF;
END $$;
