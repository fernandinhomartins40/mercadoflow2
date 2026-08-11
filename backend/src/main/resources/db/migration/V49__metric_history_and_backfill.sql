-- Histórico de métricas por produto + suporte a carga inicial (backfill).
--
-- DOIS PROBLEMAS, uma migration:
--
-- 1. HISTÓRICO. A materialização é destrutiva (delete + insert): cada rodada
--    apaga o retrato anterior. Não há como responder "o giro deste produto está
--    melhorando?" nem comparar hoje com o mês passado. E toda funcionalidade
--    futura que dependa de série temporal — incluindo a divisão para
--    fabricantes, que precisa mostrar evolução do produto no mercado — não tem
--    de onde partir. Dado que não foi guardado não se recupera depois.
--
-- 2. BACKFILL. Na primeira instalação o agente encontra meses de XMLs na pasta
--    e envia tudo. Hoje a inteligência ignora esse acervo: as janelas são de
--    90/180/365 dias contadas de HOJE, então um mercado que subiu um ano de
--    notas antigas aparece sem capital, sem giro e sem oportunidade — dando ao
--    cliente novo a impressão de que o produto não funciona, justamente no
--    primeiro contato.

-- ── 1. Histórico de métricas por produto ───────────────────────────────────
-- Um snapshot por produto por dia. Granularidade diária (e não a cada
-- materialização) porque o interesse é a TENDÊNCIA: guardar 50 retratos do
-- mesmo dia infla a tabela sem acrescentar informação.
CREATE TABLE product_metric_history (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id             UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    product_id            UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,

    snapshot_date         DATE NOT NULL,

    -- Desempenho
    revenue               NUMERIC(14,2),
    quantity_sold         NUMERIC(14,3),
    daily_velocity        NUMERIC(14,4),

    -- Classificação
    abc_class             CHAR(1),
    xyz_class             CHAR(1),
    capital_status        VARCHAR(16),

    -- Scores
    gmroi                 NUMERIC(12,4),
    coverage_days         NUMERIC(10,2),
    momentum_score        NUMERIC(9,4),
    stagnation_risk       NUMERIC(5,4),
    priority_score        NUMERIC(9,4),

    -- Margem e capital
    gross_margin_percent  NUMERIC(9,4),
    unit_price            NUMERIC(14,4),
    inventory_value       NUMERIC(14,2),

    window_days           INTEGER NOT NULL DEFAULT 90,
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Um retrato por produto por dia; a materialização do dia sobrescreve.
    CONSTRAINT uq_metric_history_day UNIQUE (market_id, product_id, snapshot_date)
);

CREATE INDEX idx_metric_history_product ON product_metric_history (market_id, product_id, snapshot_date DESC);
CREATE INDEX idx_metric_history_date ON product_metric_history (market_id, snapshot_date DESC);

-- ── 2. Estado de carga inicial por mercado ─────────────────────────────────
-- Distingue "loja nova recebendo acervo histórico" de "loja em operação
-- normal". São situações que exigem tratamento diferente: na primeira, a
-- análise precisa se ancorar no período que os dados cobrem, não em "hoje".
ALTER TABLE market_refresh_state
    ADD COLUMN IF NOT EXISTS backfill_detected_at  TIMESTAMP,
    ADD COLUMN IF NOT EXISTS backfill_completed_at TIMESTAMP,
    -- Data da venda mais recente conhecida. Quando o acervo é antigo, é ela —
    -- e não a data de hoje — que ancora as janelas de análise.
    ADD COLUMN IF NOT EXISTS latest_sale_date      DATE,
    ADD COLUMN IF NOT EXISTS oldest_sale_date      DATE,
    ADD COLUMN IF NOT EXISTS total_invoices        INTEGER NOT NULL DEFAULT 0;

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE product_metric_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON product_metric_history;
CREATE POLICY tenant_isolation ON product_metric_history FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
);

DO $$
DECLARE
    app_role TEXT := 'mercadoflow_app';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON product_metric_history TO %I', app_role);
    END IF;
END $$;
