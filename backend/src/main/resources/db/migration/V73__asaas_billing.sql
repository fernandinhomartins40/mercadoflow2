-- Assinaturas S2: cobrança brasileira (Asaas) ao lado do Stripe.
-- Pix e boleto pelo Asaas, cartão pelo Stripe; o lojista escolhe no checkout.
-- Créditos de IA e do Confere passam a ser confirmados pelo aviso do Asaas,
-- sem conferência manual.

-- Chave do Asaas no painel de chaves da plataforma (cifrada como as outras).
-- default_model guarda o e-mail que recebe os avisos de falha do webhook no Asaas.
INSERT INTO ai_platform_providers (provider, base_url, default_model, priority)
VALUES ('ASAAS', 'https://api.asaas.com/v3', NULL, 80)
ON CONFLICT (provider) DO NOTHING;

-- Cliente de cada rede em cada meio de cobrança (Stripe guarda o dele no mercado).
CREATE TABLE billing_customers (
    market_id    UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    provider     VARCHAR(12) NOT NULL,
    customer_id  VARCHAR(80) NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (market_id, provider),
    CONSTRAINT uq_billing_customer UNIQUE (provider, customer_id)
);
ALTER TABLE billing_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON billing_customers;
CREATE POLICY tenant_isolation ON billing_customers FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid);

-- Avisos de cobrança já tratados: o mesmo aviso reenviado não credita duas vezes.
CREATE TABLE billing_webhook_events (
    provider     VARCHAR(12) NOT NULL,
    event_id     VARCHAR(120) NOT NULL,
    event_type   VARCHAR(60),
    received_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, event_id)
);

-- Contratação em andamento (fatura gerada, ainda não paga).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pending_plan VARCHAR(24);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pending_subscription_id VARCHAR(80);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pending_invoice_url VARCHAR(500);

-- Pedidos de crédito cobrados pelo Asaas.
ALTER TABLE ai_orders ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(80);
ALTER TABLE ai_orders ADD COLUMN IF NOT EXISTS provider_pix_payload TEXT;
ALTER TABLE ai_orders ADD COLUMN IF NOT EXISTS provider_invoice_url VARCHAR(500);
ALTER TABLE confere_orders ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(80);
ALTER TABLE confere_orders ADD COLUMN IF NOT EXISTS provider_pix_payload TEXT;
ALTER TABLE confere_orders ADD COLUMN IF NOT EXISTS provider_invoice_url VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_ai_orders_provider_payment ON ai_orders (provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_confere_orders_provider_payment ON confere_orders (provider_payment_id);

-- Nota fiscal de serviço emitida pelo Asaas a cada pagamento da assinatura.
ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS nfse_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS nfse_service_code VARCHAR(30);
ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS nfse_service_name VARCHAR(250);
ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS nfse_iss_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS nfse_observations VARCHAR(400);

-- Token que o Asaas manda em cada aviso (cifrado com a chave mestra da plataforma).
ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS asaas_webhook_token_enc TEXT;
ALTER TABLE billing_settings ADD COLUMN IF NOT EXISTS asaas_webhook_at TIMESTAMP;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON billing_customers, billing_webhook_events TO mercadoflow_app;
    END IF;
END $$;
