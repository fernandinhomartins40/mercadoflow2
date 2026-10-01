-- Assinaturas S1: uma assinatura por cliente (matriz da rede), com estado único
-- e ciclo de vida automático. Os campos antigos do mercado (plan_type,
-- billing_status, trial_ends_at...) passam a ser ESPELHO desta tabela, para o
-- resto do sistema seguir funcionando sem mudança.

-- Regras do ciclo (editáveis no superadmin).
CREATE TABLE billing_settings (
    id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    trial_days       INT NOT NULL DEFAULT 7 CHECK (trial_days BETWEEN 0 AND 60),
    grace_days       INT NOT NULL DEFAULT 7 CHECK (grace_days BETWEEN 0 AND 60),
    restricted_days  INT NOT NULL DEFAULT 30 CHECK (restricted_days BETWEEN 1 AND 365),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by       VARCHAR(255)
);
INSERT INTO billing_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE subscriptions (
    market_id                 UUID PRIMARY KEY REFERENCES markets (id) ON DELETE CASCADE,
    plan_code                 VARCHAR(24) NOT NULL DEFAULT 'FREE',
    -- FREE | TRIAL | ACTIVE | PAST_DUE | RESTRICTED | PAUSED | SUSPENDED | PENDING | CANCELLED
    status                    VARCHAR(16) NOT NULL DEFAULT 'FREE',
    -- NONE | STRIPE | ASAAS | MANUAL
    provider                  VARCHAR(12) NOT NULL DEFAULT 'NONE',
    provider_customer_id      VARCHAR(80),
    provider_subscription_id  VARCHAR(80),
    payment_method            VARCHAR(20),
    current_period_end        TIMESTAMP,
    cancel_at_period_end      BOOLEAN NOT NULL DEFAULT FALSE,
    trial_plan                VARCHAR(24),
    trial_ends_at             TIMESTAMP,
    trial_used                BOOLEAN NOT NULL DEFAULT FALSE,
    past_due_since            TIMESTAMP,
    restricted_since          TIMESTAMP,
    paused_until              TIMESTAMP,
    created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);
CREATE INDEX idx_subscriptions_provider ON subscriptions (provider, provider_subscription_id);

-- Uma linha por cliente: só a matriz (filial consome a assinatura da rede).
INSERT INTO subscriptions (market_id, plan_code, status, provider, provider_customer_id, provider_subscription_id,
                           current_period_end, cancel_at_period_end, trial_plan, trial_ends_at, trial_used, past_due_since)
SELECT m.id,
       COALESCE(NULLIF(m.plan_type, ''), 'FREE'),
       CASE
           WHEN m.billing_status = 'TRIAL' THEN 'TRIAL'
           WHEN m.billing_status = 'PAST_DUE' THEN 'PAST_DUE'
           WHEN m.billing_status IN ('SUSPENDED', 'PENDING', 'CANCELLED', 'RESTRICTED') THEN m.billing_status
           WHEN COALESCE(NULLIF(m.plan_type, ''), 'FREE') = 'FREE' THEN 'FREE'
           ELSE 'ACTIVE'
       END,
       CASE
           WHEN m.stripe_subscription_id IS NOT NULL THEN 'STRIPE'
           WHEN COALESCE(NULLIF(m.plan_type, ''), 'FREE') = 'FREE' THEN 'NONE'
           ELSE 'MANUAL'
       END,
       m.stripe_customer_id, m.stripe_subscription_id, m.current_period_end, COALESCE(m.cancel_at_period_end, FALSE),
       CASE WHEN m.billing_status = 'TRIAL' THEN m.plan_type END,
       m.trial_ends_at,
       m.billing_status = 'TRIAL',
       CASE WHEN m.billing_status = 'PAST_DUE' THEN NOW() END
  FROM markets m
 WHERE m.parent_market_id IS NULL
ON CONFLICT (market_id) DO NOTHING;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON subscriptions;
CREATE POLICY tenant_isolation ON subscriptions FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
    OR market_id = (SELECT parent_market_id FROM markets WHERE id = NULLIF(current_setting('app.current_market', true), '')::uuid));

-- Avisos no app (faixa no topo e lista). Um aviso por chave: o job diário não repete.
CREATE TABLE app_notifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id     UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    kind          VARCHAR(40) NOT NULL,
    severity      VARCHAR(10) NOT NULL DEFAULT 'INFO',   -- INFO | WARNING | DANGER
    title         VARCHAR(160) NOT NULL,
    body          VARCHAR(600) NOT NULL,
    action_label  VARCHAR(60),
    action_url    VARCHAR(300),
    dedup_key     VARCHAR(120) NOT NULL,
    emailed_at    TIMESTAMP,
    read_at       TIMESTAMP,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_app_notification UNIQUE (market_id, dedup_key)
);
CREATE INDEX idx_app_notifications_market ON app_notifications (market_id, created_at DESC);

ALTER TABLE app_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON app_notifications;
CREATE POLICY tenant_isolation ON app_notifications FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions, app_notifications TO mercadoflow_app;
        GRANT SELECT, INSERT, UPDATE ON billing_settings TO mercadoflow_app;
    END IF;
END $$;
