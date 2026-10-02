-- Assinaturas S3: o que cada plano dá passa a morar no catálogo (e não no código),
-- o Copiloto e os créditos mensais de IA entram nos planos, adicionais (loja e
-- usuário extra), pausa da assinatura e motivo do cancelamento.

-- Recursos que um plano pode dar. BOOL liga/desliga; NUMBER é quantidade.
CREATE TABLE plan_feature_definitions (
    feature_key  VARCHAR(40) PRIMARY KEY,
    label        VARCHAR(120) NOT NULL,
    kind         VARCHAR(8) NOT NULL CHECK (kind IN ('BOOL', 'NUMBER')),
    unit         VARCHAR(20),
    group_name   VARCHAR(30) NOT NULL,
    sort_order   INT NOT NULL DEFAULT 0
);

CREATE TABLE plan_features (
    plan_code    VARCHAR(24) NOT NULL REFERENCES plan_catalog (code) ON DELETE CASCADE,
    feature_key  VARCHAR(40) NOT NULL REFERENCES plan_feature_definitions (feature_key) ON DELETE CASCADE,
    enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    amount       INT,
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by   VARCHAR(255),
    PRIMARY KEY (plan_code, feature_key)
);

CREATE TABLE plan_feature_changes (
    id           BIGSERIAL PRIMARY KEY,
    plan_code    VARCHAR(24) NOT NULL,
    feature_key  VARCHAR(40) NOT NULL,
    old_value    VARCHAR(40),
    new_value    VARCHAR(40),
    actor        VARCHAR(255),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO plan_feature_definitions (feature_key, label, kind, unit, group_name, sort_order) VALUES
    ('forecast_days',         'Previsão de vendas',                            'NUMBER', 'dias',     'Inteligência', 10),
    ('network_intelligence',  'Comparação entre lojas e transferência de estoque', 'BOOL', NULL,     'Inteligência', 20),
    ('customer_intelligence', 'Clientes: frequência e recompra',               'BOOL',   NULL,       'Inteligência', 30),
    ('price_simulation',      'Simulação de preço',                            'BOOL',   NULL,       'Inteligência', 40),
    ('full_outcomes',         'Histórico de resultados das decisões',          'BOOL',   NULL,       'Inteligência', 50),
    ('data_export',           'Exportação de dados e integração',              'BOOL',   NULL,       'Inteligência', 60),
    ('copilot_brief',         'Copiloto: resumo do dia e voz',                 'BOOL',   NULL,       'Copiloto',     70),
    ('copilot_questions',     'Copiloto: perguntas sobre as suas vendas',      'BOOL',   NULL,       'Copiloto',     80),
    ('copilot_agents',        'Copiloto: agentes e caixa de decisões',         'BOOL',   NULL,       'Copiloto',     90),
    ('copilot_whatsapp',      'Copiloto no WhatsApp',                          'BOOL',   NULL,       'Copiloto',    100),
    ('copilot_autonomy',      'Copiloto faz sozinho, dentro dos seus limites', 'BOOL',   NULL,       'Copiloto',    110),
    ('ai_monthly_credits',    'Créditos de IA por mês',                        'NUMBER', 'créditos', 'Copiloto',    120);

-- Valores de partida: a escada que estava no código (12/08/2026) + Copiloto nos planos.
INSERT INTO plan_features (plan_code, feature_key, enabled, amount)
SELECT p.code, v.key, v.enabled, v.amount
  FROM plan_catalog p
  JOIN (VALUES
    ('FREE', 'forecast_days', TRUE, 7), ('ESSENCIAL', 'forecast_days', TRUE, 30),
    ('PROFISSIONAL', 'forecast_days', TRUE, 90), ('REDE', 'forecast_days', TRUE, 90),
    ('FREE', 'network_intelligence', FALSE, NULL), ('ESSENCIAL', 'network_intelligence', FALSE, NULL),
    ('PROFISSIONAL', 'network_intelligence', TRUE, NULL), ('REDE', 'network_intelligence', TRUE, NULL),
    ('FREE', 'customer_intelligence', FALSE, NULL), ('ESSENCIAL', 'customer_intelligence', FALSE, NULL),
    ('PROFISSIONAL', 'customer_intelligence', TRUE, NULL), ('REDE', 'customer_intelligence', TRUE, NULL),
    ('FREE', 'price_simulation', FALSE, NULL), ('ESSENCIAL', 'price_simulation', FALSE, NULL),
    ('PROFISSIONAL', 'price_simulation', TRUE, NULL), ('REDE', 'price_simulation', TRUE, NULL),
    ('FREE', 'full_outcomes', FALSE, NULL), ('ESSENCIAL', 'full_outcomes', FALSE, NULL),
    ('PROFISSIONAL', 'full_outcomes', TRUE, NULL), ('REDE', 'full_outcomes', TRUE, NULL),
    ('FREE', 'data_export', FALSE, NULL), ('ESSENCIAL', 'data_export', FALSE, NULL),
    ('PROFISSIONAL', 'data_export', TRUE, NULL), ('REDE', 'data_export', TRUE, NULL),
    ('FREE', 'copilot_brief', TRUE, NULL), ('ESSENCIAL', 'copilot_brief', TRUE, NULL),
    ('PROFISSIONAL', 'copilot_brief', TRUE, NULL), ('REDE', 'copilot_brief', TRUE, NULL),
    ('FREE', 'copilot_questions', FALSE, NULL), ('ESSENCIAL', 'copilot_questions', TRUE, NULL),
    ('PROFISSIONAL', 'copilot_questions', TRUE, NULL), ('REDE', 'copilot_questions', TRUE, NULL),
    ('FREE', 'copilot_agents', FALSE, NULL), ('ESSENCIAL', 'copilot_agents', TRUE, NULL),
    ('PROFISSIONAL', 'copilot_agents', TRUE, NULL), ('REDE', 'copilot_agents', TRUE, NULL),
    ('FREE', 'copilot_whatsapp', FALSE, NULL), ('ESSENCIAL', 'copilot_whatsapp', FALSE, NULL),
    ('PROFISSIONAL', 'copilot_whatsapp', TRUE, NULL), ('REDE', 'copilot_whatsapp', TRUE, NULL),
    ('FREE', 'copilot_autonomy', FALSE, NULL), ('ESSENCIAL', 'copilot_autonomy', FALSE, NULL),
    ('PROFISSIONAL', 'copilot_autonomy', TRUE, NULL), ('REDE', 'copilot_autonomy', TRUE, NULL),
    ('FREE', 'ai_monthly_credits', TRUE, 50), ('ESSENCIAL', 'ai_monthly_credits', TRUE, 500),
    ('PROFISSIONAL', 'ai_monthly_credits', TRUE, 1500), ('REDE', 'ai_monthly_credits', TRUE, 3000)
  ) AS v(plan, key, enabled, amount) ON v.plan = p.code
ON CONFLICT DO NOTHING;

-- Descrição curta de cada plano para a vitrine (o que muda de um para o outro).
UPDATE plan_catalog SET description = 'Para conhecer: o retrato da loja e o resumo do dia' WHERE code = 'FREE';
UPDATE plan_catalog SET description = 'Loja única: análise completa e Copiloto com agentes' WHERE code = 'ESSENCIAL';
UPDATE plan_catalog SET description = 'Até 3 lojas: rede, clientes, simulação de preço e Copiloto no WhatsApp' WHERE code = 'PROFISSIONAL';
UPDATE plan_catalog SET description = 'Redes maiores, com limites negociados' WHERE code = 'REDE';

-- Créditos de IA inclusos no plano: saldo do mês, gasto antes do comprado, renovado todo mês.
ALTER TABLE ai_wallets ADD COLUMN IF NOT EXISTS included_balance INT NOT NULL DEFAULT 0;
ALTER TABLE ai_wallets ADD COLUMN IF NOT EXISTS included_granted INT NOT NULL DEFAULT 0;
ALTER TABLE ai_wallets ADD COLUMN IF NOT EXISTS included_month DATE;

-- Adicionais cobrados junto com a assinatura.
CREATE TABLE addon_catalog (
    code                VARCHAR(24) PRIMARY KEY,
    name                VARCHAR(80) NOT NULL,
    description         VARCHAR(200),
    monthly_price_cents INT NOT NULL CHECK (monthly_price_cents >= 0),
    max_quantity        INT NOT NULL DEFAULT 20,
    active              BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO addon_catalog (code, name, description, monthly_price_cents, max_quantity) VALUES
    ('EXTRA_STORE', 'Loja extra', 'Mais uma loja na rede, com os caixas do plano', 7900, 20),
    ('EXTRA_SEAT',  'Usuário extra', 'Mais uma pessoa com acesso', 1900, 50)
ON CONFLICT DO NOTHING;

CREATE TABLE subscription_addons (
    market_id   UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    addon_code  VARCHAR(24) NOT NULL REFERENCES addon_catalog (code),
    quantity    INT NOT NULL CHECK (quantity > 0),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (market_id, addon_code)
);
ALTER TABLE subscription_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON subscription_addons;
CREATE POLICY tenant_isolation ON subscription_addons FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
    OR market_id = (SELECT parent_market_id FROM markets WHERE id = NULLIF(current_setting('app.current_market', true), '')::uuid));

-- Pausa: o fim do período pago anda junto com a pausa.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paused_from TIMESTAMP;

-- Por que cancelou (e se a pausa foi oferecida).
CREATE TABLE subscription_cancel_feedback (
    id          BIGSERIAL PRIMARY KEY,
    market_id   UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    reason      VARCHAR(40) NOT NULL,
    comment     VARCHAR(600),
    outcome     VARCHAR(12) NOT NULL,  -- CANCELED | PAUSED
    actor       VARCHAR(255),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE subscription_cancel_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON subscription_cancel_feedback;
CREATE POLICY tenant_isolation ON subscription_cancel_feedback FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT ON plan_feature_definitions TO mercadoflow_app;
        GRANT SELECT, INSERT, UPDATE ON plan_features, addon_catalog TO mercadoflow_app;
        GRANT SELECT, INSERT ON plan_feature_changes TO mercadoflow_app;
        GRANT USAGE ON SEQUENCE plan_feature_changes_id_seq, subscription_cancel_feedback_id_seq TO mercadoflow_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON subscription_addons TO mercadoflow_app;
        GRANT SELECT, INSERT ON subscription_cancel_feedback TO mercadoflow_app;
    END IF;
END $$;
