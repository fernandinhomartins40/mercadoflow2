-- Opportunity Engine + Recommendation Engine (Fases 3 e 4 do plano).
--
-- O QUE MUDA CONCEITUALMENTE: até aqui o sistema detectava coisas (alertas,
-- candidatos a promoção, vereditos de capital) em três formatos distintos, sem
-- ciclo de vida e sem memória. Uma oportunidade aparecia no feed, o usuário
-- resolvia (ou não), e no dia seguinte ela reaparecia idêntica — o sistema nunca
-- soube o que foi feito nem se funcionou.
--
-- Estas duas tabelas fecham DECISÃO → AÇÃO → RESULTADO:
--   opportunities   o que o sistema viu, com evidência numérica e ciclo de vida
--   recommendations o que ele sugere fazer, com o cálculo por trás e a decisão
--                   registrada do usuário
--
-- recommendation_outcomes prepara a Fase 8 (feedback loop): guarda o previsto
-- no momento da decisão para comparar com o realizado depois. Sem snapshot no
-- ato, "a recomendação funcionou?" vira opinião.

-- ── 1. Oportunidades ───────────────────────────────────────────────────────
CREATE TABLE opportunities (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id             UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,

    -- Chave estável do detector: identifica a MESMA oportunidade entre
    -- execuções, para atualizar em vez de duplicar. Ex.: "CAPITAL:<produto>".
    fingerprint           VARCHAR(200) NOT NULL,

    type                  VARCHAR(48) NOT NULL,
    source                VARCHAR(24) NOT NULL,

    product_id            UUID REFERENCES products (id) ON DELETE CASCADE,
    category              VARCHAR(200),

    title                 VARCHAR(300) NOT NULL,
    description           TEXT,

    -- Os números que sustentam a oportunidade. jsonb e não texto: permite
    -- consultar por dentro (ex.: cobertura < 3 dias) sem reprocessar.
    evidence              JSONB,

    expected_impact_value NUMERIC(14,2),
    confidence            NUMERIC(5,4),
    priority_score        NUMERIC(9,4) NOT NULL DEFAULT 0,

    -- NOVA → VISTA → EM_ACAO → CONCLUIDA | DESCARTADA | EXPIRADA
    status                VARCHAR(16) NOT NULL DEFAULT 'NOVA',

    first_detected_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    last_detected_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    -- Quantas vezes o detector reencontrou a mesma situação. Uma oportunidade
    -- que persiste por semanas diz mais que uma que apareceu ontem.
    detection_count       INTEGER NOT NULL DEFAULT 1,

    status_changed_at     TIMESTAMP,
    status_changed_by     VARCHAR(200),
    dismiss_reason        VARCHAR(500),

    expires_at            TIMESTAMP,
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_opportunity_market_fingerprint UNIQUE (market_id, fingerprint)
);

CREATE INDEX idx_opportunities_market_status ON opportunities (market_id, status);
CREATE INDEX idx_opportunities_priority ON opportunities (market_id, status, priority_score DESC);
CREATE INDEX idx_opportunities_type ON opportunities (market_id, type);
CREATE INDEX idx_opportunities_product ON opportunities (market_id, product_id);

-- ── 2. Recomendações ───────────────────────────────────────────────────────
-- Uma oportunidade pode gerar mais de uma recomendação ao longo do tempo (a
-- situação muda, a sugestão muda), por isso não é 1:1.
CREATE TABLE recommendations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id             UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    opportunity_id        UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,

    -- COMPRAR / PROMOVER / LIQUIDAR / AJUSTAR_PRECO / REPOSICIONAR / INVESTIGAR
    action_type           VARCHAR(24) NOT NULL,

    title                 VARCHAR(300) NOT NULL,
    -- Texto em linguagem do supermercadista. Determinístico por construção; na
    -- Fase 5 o LLM pode reescrevê-lo, mas este campo continua sendo o fallback.
    rationale             TEXT,

    -- Parâmetros acionáveis: quantidade, desconto, janela sugerida.
    parameters            JSONB,
    evidence              JSONB,
    -- Como o número foi obtido, passo a passo. É o que permite ao lojista
    -- discordar com fundamento em vez de simplesmente não confiar.
    calculation_trace     TEXT,

    confidence            NUMERIC(5,4),
    expected_impact_value NUMERIC(14,2),

    -- PROPOSTA → ACEITA | REJEITADA → EXECUTADA
    status                VARCHAR(16) NOT NULL DEFAULT 'PROPOSTA',
    decided_by            VARCHAR(200),
    decided_at            TIMESTAMP,
    decision_note         VARCHAR(500),

    created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recommendations_market_status ON recommendations (market_id, status);
CREATE INDEX idx_recommendations_opportunity ON recommendations (opportunity_id);
CREATE INDEX idx_recommendations_action ON recommendations (market_id, action_type);

-- ── 3. Resultado da decisão (base da Fase 8) ───────────────────────────────
-- predicted_* é gravado NO MOMENTO da decisão, não depois: comparar o realizado
-- com uma previsão recalculada mais tarde mediria outra coisa.
CREATE TABLE recommendation_outcomes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id             UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    recommendation_id     UUID NOT NULL REFERENCES recommendations (id) ON DELETE CASCADE,

    horizon_days          INTEGER NOT NULL DEFAULT 30,
    measured_at           TIMESTAMP,

    predicted_value       NUMERIC(14,2),
    actual_value          NUMERIC(14,2),
    delta_value           NUMERIC(14,2),
    delta_percent         NUMERIC(9,2),

    -- ACERTOU / PARCIAL / ERROU / SEM_DADOS
    verdict               VARCHAR(16),
    notes                 TEXT,

    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_outcome_recommendation UNIQUE (recommendation_id)
);

CREATE INDEX idx_outcomes_market ON recommendation_outcomes (market_id);

-- ── 4. Alerta como notificação de oportunidade ─────────────────────────────
-- A UI de alertas continua funcionando durante a transição; o vínculo permite
-- navegar do alerta para a oportunidade que o originou.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS opportunity_id UUID
    REFERENCES opportunities (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alerts_opportunity ON alerts (opportunity_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    alvo TEXT;
    alvos TEXT[] := ARRAY['opportunities', 'recommendations', 'recommendation_outcomes'];
BEGIN
    FOREACH alvo IN ARRAY alvos LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', alvo);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', alvo);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING ('
            || 'current_setting(''app.is_admin'', true) = ''true'''
            || ' OR market_id = NULLIF(current_setting(''app.current_market'', true), '''')::uuid'
            || ')',
            alvo
        );
    END LOOP;
END $$;

-- A role da aplicação (sem BYPASSRLS) precisa de DML explícito nas tabelas
-- novas — sem isso o backend falha com permission denied mesmo com a policy
-- correta. Ver V41/V45.
DO $$
DECLARE
    app_role TEXT := 'mercadoflow_app';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON opportunities, recommendations, '
            || 'recommendation_outcomes TO %I', app_role);
    END IF;
END $$;
