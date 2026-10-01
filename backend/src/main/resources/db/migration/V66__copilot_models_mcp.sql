-- Copiloto F4: cadeia de reserva de modelos por tarefa e servidor MCP do MercadoFlow.

-- Se o modelo principal da rota falhar, tenta os da lista, na ordem. Cada um com
-- o próprio preço de referência (o custo por tarefa é medido por modelo).
CREATE TABLE ai_route_fallbacks (
    task                VARCHAR(40) NOT NULL REFERENCES ai_task_routes (task) ON DELETE CASCADE,
    position            SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 5),
    provider            VARCHAR(24) NOT NULL,
    model               VARCHAR(120) NOT NULL,
    input_price_usd_m   NUMERIC(10,4) NOT NULL DEFAULT 0,
    output_price_usd_m  NUMERIC(10,4) NOT NULL DEFAULT 0,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by          VARCHAR(255),
    PRIMARY KEY (task, position)
);

-- Reserva inicial: Qwen 3.5 Flash pelo OpenRouter (confira o id do modelo no OpenRouter antes de ligar).
INSERT INTO ai_route_fallbacks (task, position, provider, model, input_price_usd_m, output_price_usd_m)
SELECT task, 1, 'OPENROUTER', 'qwen/qwen3.5-flash', 0.10, 0.40 FROM ai_task_routes
 WHERE task IN ('PERGUNTE_AOS_DADOS', 'INTERPRETAR_OPORTUNIDADE', 'AGENTE_EXPLICAR', 'PLANO_COMPRAS')
ON CONFLICT DO NOTHING;

-- Chaves do servidor MCP: só leitura, por mercado. Guardamos só o hash; a chave
-- aparece uma única vez, na criação.
CREATE TABLE ai_mcp_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id     UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    name          VARCHAR(80) NOT NULL,
    key_hash      VARCHAR(64) NOT NULL UNIQUE,
    key_prefix    VARCHAR(16) NOT NULL,
    created_by    VARCHAR(255),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at  TIMESTAMP,
    calls         BIGINT NOT NULL DEFAULT 0,
    revoked_at    TIMESTAMP
);
CREATE INDEX idx_ai_mcp_keys_market ON ai_mcp_keys (market_id);

ALTER TABLE ai_mcp_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ai_mcp_keys;
CREATE POLICY tenant_isolation ON ai_mcp_keys FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ai_mcp_keys TO mercadoflow_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ai_route_fallbacks TO mercadoflow_app;
    END IF;
END $$;
