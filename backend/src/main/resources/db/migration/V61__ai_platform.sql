-- IA da plataforma (Copiloto): a plataforma compra créditos nos provedores (DeepSeek, Jev…) e
-- revende pacotes aos mercados. Proposta em docs/PROPOSTA-IA-AGENTES.md (fases F0a e F0).
--
-- Plataforma (sem mercado): chaves, configurações, roteamento por tarefa, mercados de teste,
-- auditoria do painel. Mercado (RLS): carteira de créditos, extrato, pedidos, decisões em sombra.

-- ── Plataforma ────────────────────────────────────────────────────────────

CREATE TABLE ai_platform_providers (
    provider           VARCHAR(24) PRIMARY KEY,   -- DEEPSEEK | JEV | OPENROUTER | DEEPGRAM | WHATSAPP
    base_url           VARCHAR(200) NOT NULL,
    encrypted_api_key  TEXT,
    key_hint           VARCHAR(8),
    enabled            BOOLEAN NOT NULL DEFAULT FALSE,
    priority           INT NOT NULL DEFAULT 100,
    default_model      VARCHAR(120),
    last_check_at      TIMESTAMP,
    last_check_ok      BOOLEAN,
    last_check_error   VARCHAR(500),
    last_check_ms      INT,
    updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by         VARCHAR(255)
);

INSERT INTO ai_platform_providers (provider, base_url, default_model, priority) VALUES
    ('DEEPSEEK',   'https://api.deepseek.com',      'deepseek-flash', 10),
    ('OPENROUTER', 'https://openrouter.ai/api/v1',  'qwen/qwen3.5-flash', 20),
    ('JEV',        'https://api.typesafe.ai',       'jev-latest', 5),
    ('DEEPGRAM',   'https://api.deepgram.com',      'nova-3', 50),
    ('WHATSAPP',   'https://graph.facebook.com',    'v21.0', 60);

-- Chave antiga dos temas de encarte (V57) vira a chave DeepSeek da plataforma, se existir.
UPDATE ai_platform_providers p
   SET encrypted_api_key = s.encrypted_api_key, key_hint = s.key_hint, enabled = TRUE,
       updated_at = NOW(), updated_by = 'migracao-V61'
  FROM platform_ai_settings s
 WHERE p.provider = 'DEEPSEEK' AND s.purpose = 'ART_THEMES' AND s.encrypted_api_key IS NOT NULL;

CREATE TABLE ai_platform_settings (
    id                          VARCHAR(16) PRIMARY KEY DEFAULT 'default',
    -- Interruptor geral: desligado, ninguém usa a chave da plataforma (texto pronto para todos).
    enabled                     BOOLEAN NOT NULL DEFAULT FALSE,
    -- Só os mercados da lista de teste usam a chave da plataforma.
    pilot_only                  BOOLEAN NOT NULL DEFAULT TRUE,
    daily_budget_usd            NUMERIC(10,2) NOT NULL DEFAULT 5.00,
    low_balance_alert_usd       NUMERIC(10,2) NOT NULL DEFAULT 10.00,
    default_monthly_cap_credits INT NOT NULL DEFAULT 3000,
    usd_brl                     NUMERIC(6,3) NOT NULL DEFAULT 5.500,
    pilot_grant_credits         INT NOT NULL DEFAULT 500,
    updated_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by                  VARCHAR(255)
);
INSERT INTO ai_platform_settings (id) VALUES ('default');

-- Roteamento por tarefa: camada, modelo, tetos, preço de referência e créditos debitados.
CREATE TABLE ai_task_routes (
    task                VARCHAR(40) PRIMARY KEY,
    label               VARCHAR(120) NOT NULL,
    layer               VARCHAR(12) NOT NULL,      -- TEMPLATE | JEV | FLASH | PRO
    provider            VARCHAR(24),
    model               VARCHAR(120),
    max_context_tokens  INT NOT NULL DEFAULT 8000,
    max_output_tokens   INT NOT NULL DEFAULT 600,
    temperature         NUMERIC(3,2) NOT NULL DEFAULT 0.30,
    jev_threshold       NUMERIC(4,3) NOT NULL DEFAULT 0.800,
    credits_per_use     INT NOT NULL DEFAULT 1,
    input_price_usd_m   NUMERIC(10,4) NOT NULL DEFAULT 0.3000,
    output_price_usd_m  NUMERIC(10,4) NOT NULL DEFAULT 1.2000,
    shadow              BOOLEAN NOT NULL DEFAULT FALSE,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    notes               VARCHAR(300),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by          VARCHAR(255)
);

INSERT INTO ai_task_routes (task, label, layer, provider, model, max_context_tokens, max_output_tokens, temperature,
                            credits_per_use, input_price_usd_m, output_price_usd_m, shadow, notes) VALUES
 ('PERGUNTE_AOS_DADOS', 'Chat: pergunta com ferramentas', 'FLASH', 'DEEPSEEK', 'deepseek-flash', 8000, 900, 0.00, 1, 0.30, 1.20, FALSE,
  'Resposta a pergunta aberta. Número direto responde por texto pronto (F1).'),
 ('INTERPRETAR_OPORTUNIDADE', 'Por quê? de uma oportunidade', 'FLASH', 'DEEPSEEK', 'deepseek-flash', 2000, 400, 0.30, 1, 0.30, 1.20, FALSE,
  'Só sob demanda, quando o lojista toca em Por quê?'),
 ('RESUMO_SEMANAL', 'Resumo da semana (comentário)', 'TEMPLATE', 'DEEPSEEK', 'deepseek-flash', 5000, 600, 0.40, 1, 0.30, 1.20, FALSE,
  'Texto pronto por padrão; mude para FLASH para a IA comentar.'),
 ('PLANO_COMPRAS', 'Plano de compras sob medida', 'PRO', 'DEEPSEEK', 'deepseek-pro', 10000, 1500, 0.20, 5, 1.32, 3.96, FALSE,
  'Só quando o lojista pede uma estratégia.'),
 ('JEV_FERRAMENTA', 'Jev: escolher a ferramenta da pergunta', 'JEV', 'JEV', 'jev-latest', 4000, 0, 0.00, 0, 0.042, 0.00, TRUE,
  'Em sombra: compara com a escolha do DeepSeek sem afetar a resposta.'),
 ('JEV_VALE_EXPLICAR', 'Jev: o texto do sistema já explica?', 'JEV', 'JEV', 'jev-latest', 2000, 0, 0.00, 0, 0.042, 0.00, TRUE,
  'Em sombra: compara com o que o lojista faz.'),
 ('JEV_RELEVANCIA', 'Jev: relevância de contexto', 'JEV', 'JEV', 'jev-latest', 32000, 0, 0.00, 0, 0.042, 0.00, TRUE,
  'Montagem de contexto (seção 6.6).');

CREATE TABLE ai_pilot_markets (
    market_id  UUID PRIMARY KEY REFERENCES markets (id) ON DELETE CASCADE,
    added_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    added_by   VARCHAR(255)
);

CREATE TABLE ai_admin_audit (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor       VARCHAR(255),
    action      VARCHAR(40) NOT NULL,
    detail      VARCHAR(500),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_admin_audit_date ON ai_admin_audit (created_at DESC);

CREATE TABLE ai_plans (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(80) NOT NULL,
    credits     INT NOT NULL,
    price_cents INT NOT NULL,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INT NOT NULL DEFAULT 0
);
INSERT INTO ai_plans (name, credits, price_cents, sort_order) VALUES
    ('Recarga 500 créditos', 500, 3900, 1),
    ('Copiloto: 800 créditos', 800, 7900, 2),
    ('Copiloto Pro: 2.500 créditos', 2500, 19900, 3);

-- Registro de uso: custo, camada e créditos por chamada.
ALTER TABLE ai_usage_log
    ADD COLUMN IF NOT EXISTS cost_usd  NUMERIC(12,6),
    ADD COLUMN IF NOT EXISTS layer     VARCHAR(12),
    ADD COLUMN IF NOT EXISTS credits   INT,
    ADD COLUMN IF NOT EXISTS platform  BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_ai_usage_platform_date ON ai_usage_log (platform, created_at DESC);

-- ── Mercado ───────────────────────────────────────────────────────────────

CREATE TABLE ai_wallets (
    market_id     UUID PRIMARY KEY REFERENCES markets (id) ON DELETE CASCADE,
    balance       INT NOT NULL DEFAULT 0,
    monthly_cap   INT,
    month_start   DATE NOT NULL DEFAULT date_trunc('month', NOW())::date,
    month_used    INT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ai_wallet_balance CHECK (balance >= 0)
);

CREATE TABLE ai_ledger (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id   UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    delta       INT NOT NULL,
    kind        VARCHAR(16) NOT NULL,   -- GRANT | PURCHASE | USE | ADJUST | REFUND
    task        VARCHAR(40),
    reference   VARCHAR(80),
    note        VARCHAR(200),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_ledger_market ON ai_ledger (market_id, created_at DESC);

CREATE TABLE ai_orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id     UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    plan_id       UUID REFERENCES ai_plans (id) ON DELETE SET NULL,
    credits       INT NOT NULL,
    amount_cents  INT NOT NULL,
    method        VARCHAR(12) NOT NULL DEFAULT 'PIX',
    txid          VARCHAR(40) NOT NULL,
    status        VARCHAR(12) NOT NULL DEFAULT 'PENDING',   -- PENDING | PAID | CANCELED
    confirmed_by  VARCHAR(255),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    paid_at       TIMESTAMP
);
CREATE INDEX idx_ai_orders_status ON ai_orders (status, created_at DESC);

-- Decisões do Jev em modo sombra, comparadas com a referência (DeepSeek ou lojista).
CREATE TABLE ai_shadow_decisions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id         UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    task              VARCHAR(40) NOT NULL,
    jev_answer        VARCHAR(120),
    jev_confidence    NUMERIC(5,4),
    reference_answer  VARCHAR(120),
    agreed            BOOLEAN,
    latency_ms        INT,
    input_tokens      INT,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_shadow_task ON ai_shadow_decisions (task, created_at DESC);

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['ai_wallets', 'ai_ledger', 'ai_orders', 'ai_shadow_decisions']
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
            'GRANT SELECT, INSERT, UPDATE, DELETE ON ai_platform_providers, ai_platform_settings, ai_task_routes, '
            'ai_pilot_markets, ai_admin_audit, ai_plans, ai_wallets, ai_ledger, ai_orders, ai_shadow_decisions TO %I', app_role);
    END IF;
END $$;
