-- Cadência adaptativa: a inteligência passa a acompanhar o ritmo de CADA loja.
--
-- PROBLEMA: o agente entrega a nota em segundos (watchdog, evento on_created),
-- mas a inteligência que a consome rodava uma vez por dia. O supermercadista
-- atende fornecedor pela manhã decidindo com números calculados às 03:00 —
-- antes de fechar o caixa da noite anterior.
--
-- E um intervalo fixo igual para todos contradiria o princípio que rege o resto
-- do sistema: ABC, z-score e turnover band são todos relativos ao próprio
-- portfólio, porque cada loja tem produtos, clientes e ritmo próprios. O ritmo
-- da ANÁLISE precisa seguir a mesma regra.
--
-- Duas peças:
--   1. sazonalidade por HORA (a V31 previu DOW e MONTH; faltava a hora, que é
--      justamente a granularidade que define pico de movimento)
--   2. estado do refresh incremental por mercado — de onde continuar e quando
--      rodar de novo

-- ── 1. Sazonalidade horária ────────────────────────────────────────────────
-- period_type já é varchar(8) e aceita 'HOUR' sem alteração de schema; o que
-- falta é a aplicação gravar. Este índice serve a consulta de perfil de ritmo,
-- que roda a cada ciclo e precisa ser barata.
CREATE INDEX IF NOT EXISTS idx_seasonality_hour
    ON product_seasonality (market_id, period_type, period_index)
    WHERE period_type = 'HOUR';

-- ── 2. Estado do refresh incremental ───────────────────────────────────────
CREATE TABLE market_refresh_state (
    market_id             UUID PRIMARY KEY REFERENCES markets (id) ON DELETE CASCADE,

    -- Marco de continuidade: só produtos com venda depois disto são
    -- recalculados. É o que faz o custo escalar com o MOVIMENTO e não com o
    -- tamanho do catálogo.
    last_incremental_at   TIMESTAMP,
    last_full_at          TIMESTAMP,

    -- Quando o próximo ciclo deve rodar. Escrito pelo próprio job conforme o
    -- ritmo detectado, então o agendador só precisa perguntar "já passou?".
    next_run_at           TIMESTAMP,

    -- PICO / NORMAL / VALE / OCIOSA — perfil no último ciclo, para diagnóstico
    -- e para explicar ao lojista por que a loja dele atualiza no ritmo que
    -- atualiza.
    rhythm                VARCHAR(12),
    last_interval_minutes INTEGER,

    -- Volume observado no ciclo, base da decisão de cadência.
    invoices_last_cycle   INTEGER NOT NULL DEFAULT 0,
    products_last_cycle   INTEGER NOT NULL DEFAULT 0,

    consecutive_idle_cycles INTEGER NOT NULL DEFAULT 0,
    updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_state_next_run ON market_refresh_state (next_run_at);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- market_id é a própria PK aqui, como em market_customer_salts (V45).
ALTER TABLE market_refresh_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON market_refresh_state;
CREATE POLICY tenant_isolation ON market_refresh_state FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
);

DO $$
DECLARE
    app_role TEXT := 'mercadoflow_app';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON market_refresh_state TO %I', app_role);
    END IF;
END $$;
