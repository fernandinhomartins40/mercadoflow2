-- Copiloto F3a: agentes em funil (motor → memória → Jev → DeepSeek só no "Por quê?"),
-- caixa de decisões, lições da loja e rastro do contexto enviado à IA.

-- Preferências por agente (o lojista escolhe). Nível 3 (executar sozinho) fica para a F5.
CREATE TABLE ai_agent_settings (
    market_id     UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    agent         VARCHAR(20) NOT NULL,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    level         SMALLINT NOT NULL DEFAULT 2 CHECK (level BETWEEN 0 AND 2),
    daily_limit   INT NOT NULL DEFAULT 5 CHECK (daily_limit BETWEEN 0 AND 50),
    min_impact    NUMERIC(14,2) NOT NULL DEFAULT 0,
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by    VARCHAR(255),
    PRIMARY KEY (market_id, agent)
);

-- Preferências gerais do Copiloto: horário de silêncio e canal.
CREATE TABLE ai_copilot_prefs (
    market_id         UUID PRIMARY KEY REFERENCES markets (id) ON DELETE CASCADE,
    quiet_start       TIME NOT NULL DEFAULT '21:00',
    quiet_end         TIME NOT NULL DEFAULT '07:00',
    whatsapp_phone    VARCHAR(20),
    whatsapp_opt_in   BOOLEAN NOT NULL DEFAULT FALSE,
    whatsapp_opt_in_at TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by        VARCHAR(255)
);

-- Caixa de decisões: o que os agentes prepararam. Dedup por hash dos números.
CREATE TABLE ai_decisions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id      UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    agent          VARCHAR(20) NOT NULL,
    kind           VARCHAR(30) NOT NULL,
    scope_key      VARCHAR(120),
    title          VARCHAR(200) NOT NULL,
    body           TEXT NOT NULL,
    numbers        JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
    impact         NUMERIC(14,2),
    level          SMALLINT NOT NULL,
    urgent         BOOLEAN NOT NULL DEFAULT FALSE,
    status         VARCHAR(16) NOT NULL,      -- PENDENTE | INFORMATIVA | SILENCIADA | APROVADA | RECUSADA | EXPIRADA
    funnel         JSONB NOT NULL DEFAULT '{}'::jsonb,
    explanation    TEXT,
    signal_hash    VARCHAR(64) NOT NULL,
    notified_at    TIMESTAMP,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    decided_at     TIMESTAMP,
    decided_by     VARCHAR(255),
    decision_note  VARCHAR(300),
    result         JSONB,
    expires_at     TIMESTAMP,
    CONSTRAINT uq_ai_decision_signal UNIQUE (market_id, signal_hash)
);
CREATE INDEX idx_ai_decisions_inbox ON ai_decisions (market_id, status, created_at DESC);
CREATE INDEX idx_ai_decisions_scope ON ai_decisions (market_id, agent, scope_key, status);

-- Lições da loja (memória): frases curtas com evidência, produzidas por código.
CREATE TABLE ai_lessons (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id   UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    scope       VARCHAR(20) NOT NULL,         -- FORNECEDOR | ACAO | PREFERENCIA
    scope_key   VARCHAR(120) NOT NULL,
    topic       VARCHAR(40) NOT NULL,
    text        VARCHAR(400) NOT NULL,
    evidence    JSONB NOT NULL DEFAULT '{}'::jsonb,
    weight      NUMERIC(5,2) NOT NULL DEFAULT 1,
    source      VARCHAR(20) NOT NULL,         -- CONFERE | RESULTADO | RECUSA
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ai_lesson UNIQUE (market_id, scope, scope_key, topic)
);

-- Rastro: quais pedaços de memória entraram em cada chamada à IA.
CREATE TABLE ai_context_traces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id   UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    task        VARCHAR(40) NOT NULL,
    ref_id      UUID,
    candidates  INT NOT NULL,
    pieces      JSONB NOT NULL,
    selector    VARCHAR(12) NOT NULL,         -- JEV | REGRA
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_context_traces ON ai_context_traces (market_id, created_at DESC);

-- Execuções dos agentes: quantos sinais passaram por cada andar do funil.
CREATE TABLE ai_agent_runs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id   UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    run_trigger VARCHAR(12) NOT NULL,         -- HORARIO | MANUAL
    signals     INT NOT NULL,
    after_memory INT NOT NULL,
    jev_calls   INT NOT NULL,
    created     INT NOT NULL,
    silenced    INT NOT NULL,
    detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_agent_runs ON ai_agent_runs (market_id, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['ai_agent_settings', 'ai_copilot_prefs', 'ai_decisions', 'ai_lessons', 'ai_context_traces', 'ai_agent_runs'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING ('
            || 'current_setting(''app.is_admin'', true) = ''true'' '
            || 'OR market_id = NULLIF(current_setting(''app.current_market'', true), '''')::uuid)', t);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO mercadoflow_app', t);
        END IF;
    END LOOP;
END $$;

-- Rotas novas: o Jev da vigília (andar 3) e o "Por quê?" de uma decisão (andar 4).
INSERT INTO ai_task_routes (task, label, layer, provider, model, max_context_tokens, max_output_tokens, temperature,
                            credits_per_use, input_price_usd_m, output_price_usd_m, shadow, notes) VALUES
 ('JEV_VIGILIA', 'Jev: o sinal merece avisar o lojista?', 'JEV', 'JEV', 'jev-latest', 2000, 0, 0.00, 0, 0.042, 0.00, FALSE,
  'Andar 3 do funil dos agentes. Sem Jev, vale a regra de valor mínimo.'),
 ('AGENTE_EXPLICAR', 'Por quê? de uma decisão do agente', 'FLASH', 'DEEPSEEK', 'deepseek-flash', 3000, 400, 0.30, 1, 0.30, 1.20, FALSE,
  'Só quando o lojista toca em Por quê? numa decisão. Contexto montado com lições escolhidas.')
ON CONFLICT (task) DO NOTHING;

-- A seleção de memória pelo Jev passa a valer (era só sombra na V61).
UPDATE ai_task_routes SET shadow = FALSE, notes = 'Nota de relevância das lições para o Por quê? das decisões. Sem Jev, entra a regra (mais recente e mesmo assunto).'
 WHERE task = 'JEV_RELEVANCIA';
