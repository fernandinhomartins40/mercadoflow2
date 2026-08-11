-- AI Orchestrator com BYOK por mercado (Fase 5 do plano).
--
-- DECISÃO QUE MOLDA ESTE SCHEMA (dono, 11/08/2026): a plataforma NÃO fornece
-- chave de IA. Cada mercado configura a própria chave, que é usada apenas na
-- conta dele. Isso troca o modelo "cota free da plataforma rateada entre
-- tenants" por "cada um paga (ou usa o free tier) do seu próprio bolso" — e
-- elimina a pergunta mais difícil da Fase 5, que era como impedir um tenant de
-- consumir a cota dos outros.
--
-- Consequência de segurança: a chave de um cliente passa a viver no nosso
-- banco. Ela é cifrada em repouso com AES-GCM (chave mestra da aplicação, fora
-- do banco), nunca é devolvida pela API — só o prefixo mascarado — e nunca é
-- logada. Ver AiCredentialCipher.
--
-- A IA é SEMPRE opcional: sem credencial válida, tudo cai no texto
-- determinístico que as Fases 3 e 4 já produzem. Nenhuma tela quebra.

-- ── 1. Credencial de IA por mercado (BYOK) ─────────────────────────────────
CREATE TABLE ai_provider_credentials (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id          UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,

    -- CEREBRAS | GROQ | NVIDIA_NIM | OPENROUTER | GEMINI | OPENAI | CUSTOM
    provider           VARCHAR(24) NOT NULL,

    -- Só preenchido para provider=CUSTOM (gateway próprio do cliente:
    -- LiteLLM, 9Router, Ollama exposto). Nos demais, a URL vem do catálogo no
    -- código — o cliente não deve precisar saber o endpoint do Groq.
    base_url           VARCHAR(500),

    -- Vazio = usa o modelo padrão do provedor no catálogo.
    model              VARCHAR(120),

    -- Chave cifrada (AES-GCM). Formato: base64(iv):base64(ciphertext+tag).
    -- Nunca sai daqui em claro; a API devolve apenas key_hint.
    encrypted_api_key  TEXT NOT NULL,

    -- Últimos 4 caracteres, para o usuário reconhecer qual chave cadastrou
    -- sem que a chave seja recuperável.
    key_hint           VARCHAR(16),

    enabled            BOOLEAN NOT NULL DEFAULT TRUE,

    -- Resultado do último teste de validade. Guardado porque uma chave que
    -- expirou precisa aparecer como problema na UI, não falhar em silêncio
    -- toda madrugada.
    last_check_at      TIMESTAMP,
    last_check_ok      BOOLEAN,
    last_check_error   VARCHAR(500),

    created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by         VARCHAR(200),
    updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Um mercado pode cadastrar vários provedores (formando a própria cadeia
    -- de fallback), mas não dois registros do mesmo provedor.
    CONSTRAINT uq_ai_credential_market_provider UNIQUE (market_id, provider)
);

CREATE INDEX idx_ai_credentials_market ON ai_provider_credentials (market_id, enabled);

-- Ordem de tentativa dentro da cadeia do mercado. Menor primeiro.
ALTER TABLE ai_provider_credentials
    ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;

-- ── 2. Cache de interpretação ──────────────────────────────────────────────
-- Uma oportunidade é interpretada UMA vez. A chave é o hash do contexto: se os
-- números não mudaram, o texto não precisa ser regerado — o que importa quando
-- quem paga o token é o cliente.
CREATE TABLE ai_interpretations (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id          UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,

    -- INTERPRETAR_OPORTUNIDADE | RESUMO_SEMANAL | ...
    task               VARCHAR(32) NOT NULL,

    -- SHA-256 do contexto estruturado enviado ao modelo. Muda quando qualquer
    -- número muda; igual = resposta reaproveitável.
    context_hash       VARCHAR(64) NOT NULL,

    -- Alvo interpretado (oportunidade, recomendação). Nullable porque tarefas
    -- de loja inteira (resumo) não têm alvo.
    subject_type       VARCHAR(24),
    subject_id         UUID,

    content            TEXT NOT NULL,

    -- Qual provedor/modelo produziu, e sob qual versão de prompt. Sem isso,
    -- comparar qualidade entre modelos vira memória.
    provider           VARCHAR(24),
    model              VARCHAR(120),
    prompt_version     VARCHAR(16),

    -- TRUE quando o conteúdo veio do fallback determinístico e não de um LLM.
    -- A UI precisa saber para não anunciar como "análise da IA".
    deterministic      BOOLEAN NOT NULL DEFAULT FALSE,

    created_at         TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_ai_interpretation UNIQUE (market_id, task, context_hash)
);

CREATE INDEX idx_ai_interpretations_subject
    ON ai_interpretations (market_id, subject_type, subject_id);

-- ── 3. Log de uso (observabilidade e custo) ────────────────────────────────
-- Registra a chamada, nunca o conteúdo: só o hash do contexto. Um log com o
-- prompt integral guardaria dados de venda do cliente num lugar a mais, sem
-- necessidade.
CREATE TABLE ai_usage_log (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id          UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,

    task               VARCHAR(32) NOT NULL,
    provider           VARCHAR(24),
    model              VARCHAR(120),
    prompt_version     VARCHAR(16),
    context_hash       VARCHAR(64),

    input_tokens       INTEGER,
    output_tokens      INTEGER,
    latency_ms         INTEGER,

    -- OK | ERRO | FALLBACK | SEM_CREDENCIAL | CACHE
    outcome            VARCHAR(16) NOT NULL,
    error_message      VARCHAR(500),

    created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_market_date ON ai_usage_log (market_id, created_at DESC);

-- ── 4. Interpretação vinculada à oportunidade ──────────────────────────────
-- Ponteiro direto para não precisar de join por hash no caminho do feed.
ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS interpretation_id UUID
        REFERENCES ai_interpretations (id) ON DELETE SET NULL;

-- ── RLS ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    alvo TEXT;
    alvos TEXT[] := ARRAY['ai_provider_credentials', 'ai_interpretations', 'ai_usage_log'];
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

DO $$
DECLARE
    app_role TEXT := 'mercadoflow_app';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON ai_provider_credentials, '
            || 'ai_interpretations, ai_usage_log TO %I', app_role);
    END IF;
END $$;
