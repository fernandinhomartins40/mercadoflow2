-- Resumo semanal da loja (caso 2 do §22 do plano).
--
-- POR QUE ESTE GUARDA HISTÓRICO E O CHAT NÃO: uma conversa sobre dados perde o
-- valor assim que a resposta é lida — o que importa registrar é a decisão, e
-- essa já vive em `recommendations`. O resumo semanal é diferente: ele existe
-- justamente para ser comparado com o da semana passada ("melhorou?"), e é o
-- único lugar onde o lojista vê a loja como série, não como retrato.
--
-- Os NÚMEROS ficam em jsonb junto do texto, e não só o texto. Sem eles, uma
-- troca de modelo ou de prompt tornaria os resumos antigos incomparáveis com os
-- novos, e a série perderia o sentido. Com eles, o texto é a leitura e o jsonb
-- é o fato.

CREATE TABLE weekly_digests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id         UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,

    -- Segunda-feira da semana resumida. Âncora do período, não data de geração:
    -- um reprocessamento tardio não deve criar uma segunda linha da mesma semana.
    week_start        DATE NOT NULL,
    week_end          DATE NOT NULL,

    -- Os fatos apurados: faturamento, cupons, ticket, variação, destaques,
    -- oportunidades abertas. É o que permite comparar semanas mesmo que o
    -- modelo ou o prompt mudem.
    metrics           JSONB NOT NULL,

    -- A leitura em linguagem do supermercadista.
    summary           TEXT NOT NULL,

    -- TRUE quando o texto veio do fallback determinístico e não de um LLM.
    -- A UI precisa distinguir: anunciar o texto do sistema como análise de IA
    -- enganaria o usuário sobre a origem do que ele lê.
    deterministic     BOOLEAN NOT NULL DEFAULT FALSE,

    provider          VARCHAR(24),
    model             VARCHAR(120),
    prompt_version    VARCHAR(16),

    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Uma linha por semana por mercado. O job usa isto para ser idempotente:
    -- rodar duas vezes atualiza em vez de duplicar.
    CONSTRAINT uq_weekly_digest UNIQUE (market_id, week_start)
);

CREATE INDEX idx_weekly_digests_market ON weekly_digests (market_id, week_start DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE weekly_digests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON weekly_digests;
CREATE POLICY tenant_isolation ON weekly_digests FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
);

DO $$
DECLARE
    app_role TEXT := 'mercadoflow_app';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON weekly_digests TO %I', app_role);
    END IF;
END $$;
