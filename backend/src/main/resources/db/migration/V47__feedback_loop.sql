-- Feedback Loop (Fase 8): o sistema passa a saber se acertou.
--
-- Até aqui o ciclo parava na DECISÃO: o usuário aceitava ou recusava uma
-- recomendação e nada mais acontecia. Ninguém media se comprar aquelas 120
-- unidades foi bom negócio, e por isso nenhum score jamais se corrigiu.
--
-- Duas medições diferentes entram aqui, e é importante não confundi-las:
--
--   1. A recomendação funcionou?  (recommendation_outcomes, já criada na V46 —
--      esta migration só a completa com o snapshot do contexto)
--   2. A PREVISÃO estava certa?   (forecast_accuracy — valida o Holt-Winters,
--      que a auditoria registra como "nunca medido")
--
-- A segunda importa mesmo quando não há decisão nenhuma: se o forecast erra
-- sistematicamente, toda sugestão de compra construída sobre ele erra junto.

-- ── 1. Snapshot do contexto no ato da decisão ──────────────────────────────
-- Sem isto, medir "o que aconteceu depois" exigiria reconstruir o passado, e a
-- comparação sairia contra números recalculados hoje — que já embutem o efeito
-- da própria decisão.
ALTER TABLE recommendation_outcomes
    ADD COLUMN IF NOT EXISTS baseline_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS actual_snapshot   JSONB,
    ADD COLUMN IF NOT EXISTS measure_after     TIMESTAMP,
    ADD COLUMN IF NOT EXISTS action_type       VARCHAR(24),
    ADD COLUMN IF NOT EXISTS product_id        UUID REFERENCES products (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outcomes_pending
    ON recommendation_outcomes (market_id, measure_after)
    WHERE measured_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outcomes_verdict
    ON recommendation_outcomes (market_id, action_type, verdict);

-- ── 2. Acurácia da previsão de demanda ─────────────────────────────────────
-- Uma linha por produto/dia previsto, com o que de fato foi vendido.
--
-- MAPE (erro percentual absoluto médio) é a métrica de referência para
-- previsão de demanda no varejo. Guardamos o erro por observação em vez do
-- agregado para permitir cortes depois: por produto, por classe ABC, por dia
-- da semana — é assim que se descobre QUE tipo de item o modelo erra.
CREATE TABLE forecast_accuracy (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id         UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    product_id        UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,

    forecast_date     DATE NOT NULL,
    predicted_quantity NUMERIC(14,3) NOT NULL,
    actual_quantity   NUMERIC(14,3) NOT NULL,

    absolute_error    NUMERIC(14,3) NOT NULL,
    -- |previsto - real| / real, em pontos percentuais. Nulo quando o real é
    -- zero: dividir por zero não é erro infinito, é métrica indefinida.
    percent_error     NUMERIC(9,2),

    -- O valor real caiu dentro do intervalo de confiança de 90% do modelo?
    -- Um modelo bem calibrado acerta a faixa ~90% das vezes; muito acima disso
    -- significa intervalo largo demais para ser útil.
    within_confidence BOOLEAN,

    measured_at       TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_forecast_accuracy UNIQUE (market_id, product_id, forecast_date)
);

CREATE INDEX idx_forecast_accuracy_market ON forecast_accuracy (market_id, forecast_date DESC);
CREATE INDEX idx_forecast_accuracy_product ON forecast_accuracy (market_id, product_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE forecast_accuracy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON forecast_accuracy;
CREATE POLICY tenant_isolation ON forecast_accuracy FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
);

DO $$
DECLARE
    app_role TEXT := 'mercadoflow_app';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON forecast_accuracy TO %I', app_role);
    END IF;
END $$;
