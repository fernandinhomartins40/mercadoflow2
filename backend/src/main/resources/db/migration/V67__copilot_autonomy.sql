-- Copiloto F5: autonomia (nível 3, "fazer sozinho dentro de limites").
-- Só com liberação da plataforma, aceite explícito do lojista, teto em reais por
-- ação e por dia, lista de fornecedores permitidos e botão de pausar tudo.
-- Toda ação feita sozinha fica registrada e pode ser desfeita.

-- Liberação global (superadmin). Começa desligada.
CREATE TABLE ai_autonomy_config (
    id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled          BOOLEAN NOT NULL DEFAULT FALSE,
    max_action_cap   NUMERIC(14,2) NOT NULL DEFAULT 2000,
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by       VARCHAR(255)
);
INSERT INTO ai_autonomy_config (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE ai_agent_settings DROP CONSTRAINT IF EXISTS ai_agent_settings_level_check;
ALTER TABLE ai_agent_settings ADD CONSTRAINT ai_agent_settings_level_check CHECK (level BETWEEN 0 AND 3);
ALTER TABLE ai_agent_settings
    ADD COLUMN autonomy_cap          NUMERIC(14,2),
    ADD COLUMN autonomy_daily_cap    NUMERIC(14,2),
    ADD COLUMN allowed_suppliers     JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN autonomy_accepted_at  TIMESTAMP,
    ADD COLUMN autonomy_accepted_by  VARCHAR(255);

-- Botão de pausar tudo (por mercado).
ALTER TABLE ai_copilot_prefs
    ADD COLUMN autonomy_paused     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN autonomy_paused_at  TIMESTAMP,
    ADD COLUMN autonomy_paused_by  VARCHAR(255);

-- O que o Copiloto fez sozinho e o que foi desfeito.
ALTER TABLE ai_decisions
    ADD COLUMN auto_executed  BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN undone_at      TIMESTAMP,
    ADD COLUMN undone_by      VARCHAR(255);
CREATE INDEX idx_ai_decisions_auto ON ai_decisions (market_id, decided_at) WHERE auto_executed;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT, INSERT, UPDATE ON ai_autonomy_config TO mercadoflow_app;
    END IF;
END $$;
