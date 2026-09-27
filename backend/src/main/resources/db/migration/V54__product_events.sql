-- Eventos de produto (F1 do roadmap de produto, R-05).
--
-- Até aqui não havia como saber se uma loja chegou à primeira nota, nem em
-- quanto tempo: sem cliente real (D-009), qualquer hipótese de ativação ficava
-- sem medida. Esta tabela registra os marcos no próprio PostgreSQL — nada de
-- analytics de terceiro — e sem dado pessoal: props nunca leva e-mail, CPF,
-- IP ou nome.
--
-- Os marcos de ativação ('activation.%') acontecem uma vez por mercado. O
-- índice único parcial torna a gravação idempotente com ON CONFLICT DO NOTHING,
-- o que importa porque um deles é gravado dentro da transação da nota fiscal:
-- um conflito ali não pode abortar a ingestão.

CREATE TABLE product_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id   UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    type        VARCHAR(64) NOT NULL,
    occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
    props       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_product_events_market_type ON product_events (market_id, type);

CREATE UNIQUE INDEX uq_product_events_activation ON product_events (market_id, type)
    WHERE type LIKE 'activation.%';

-- Retroativo: mercado que já teve oportunidade detectada já passou pela
-- primeira análise. Sem isto o checklist voltaria a aparecer para ele.
INSERT INTO product_events (market_id, type, occurred_at)
SELECT market_id, 'activation.first_analysis', MIN(first_detected_at)
FROM opportunities
GROUP BY market_id
ON CONFLICT DO NOTHING;

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE product_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON product_events;
CREATE POLICY tenant_isolation ON product_events FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
);

DO $$
DECLARE
    app_role TEXT := 'mercadoflow_app';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON product_events TO %I', app_role);
    END IF;
END $$;
