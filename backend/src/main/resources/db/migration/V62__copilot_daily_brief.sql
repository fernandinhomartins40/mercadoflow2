-- Copiloto F1: resumo do dia (texto pronto, sem IA), um por mercado por dia.
CREATE TABLE ai_daily_briefs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id   UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    day         DATE NOT NULL,
    text        TEXT NOT NULL,
    items       JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ai_daily_brief UNIQUE (market_id, day)
);
CREATE INDEX idx_ai_daily_briefs_market ON ai_daily_briefs (market_id, day DESC);

ALTER TABLE ai_daily_briefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ai_daily_briefs;
CREATE POLICY tenant_isolation ON ai_daily_briefs FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ai_daily_briefs TO mercadoflow_app;
    END IF;
END $$;
