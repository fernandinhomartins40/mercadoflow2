-- Copiloto F3b: canal WhatsApp (Cloud API oficial da Meta). Avisos e resumo do
-- dia por modelo de mensagem aprovado, com botões Aprovar e Depois; respostas
-- chegam pelo webhook com assinatura verificada.

-- Configuração da plataforma (linha única). O token de acesso e o ID do número
-- ficam no provedor WHATSAPP do painel; aqui, o modelo e o webhook.
CREATE TABLE ai_whatsapp_config (
    id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    template_name    VARCHAR(80) NOT NULL DEFAULT 'mercadoflow_aviso',
    template_lang    VARCHAR(10) NOT NULL DEFAULT 'pt_BR',
    verify_token     VARCHAR(80),
    app_secret_enc   TEXT,
    app_secret_hint  VARCHAR(8),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by       VARCHAR(255)
);
INSERT INTO ai_whatsapp_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Registro das mensagens (auditoria e "já avisei hoje?").
CREATE TABLE ai_whatsapp_messages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id    UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    direction    VARCHAR(3) NOT NULL,          -- OUT | IN
    phone        VARCHAR(20) NOT NULL,
    decision_id  UUID,
    kind         VARCHAR(16) NOT NULL,         -- AVISO | RESUMO | RESPOSTA | BOTAO | TEXTO
    status       VARCHAR(16) NOT NULL,         -- ENVIADA | FALHOU | RECEBIDA
    wamid        VARCHAR(160),
    error        VARCHAR(300),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_whatsapp_messages ON ai_whatsapp_messages (market_id, created_at DESC);

ALTER TABLE ai_whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ai_whatsapp_messages;
CREATE POLICY tenant_isolation ON ai_whatsapp_messages FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ai_whatsapp_messages TO mercadoflow_app;
        GRANT SELECT, INSERT, UPDATE ON ai_whatsapp_config TO mercadoflow_app;
    END IF;
END $$;

-- Camada CANAL: "tokens de entrada" = mensagens enviadas. Preço de entrada em
-- US$ por 1 milhão de mensagens (modelo de utilidade no Brasil ≈ US$ 0,008).
INSERT INTO ai_task_routes (task, label, layer, provider, model, max_context_tokens, max_output_tokens, temperature,
                            credits_per_use, input_price_usd_m, output_price_usd_m, shadow, notes) VALUES
 ('WHATSAPP_AVISO', 'WhatsApp: aviso e resumo do dia', 'CANAL', 'WHATSAPP', NULL, 1, 0, 0.00, 0, 8000.0000, 0.00, FALSE,
  'Só para quem aceitou receber. Respeita o horário de silêncio. Resposta dentro da conversa não é cobrada.')
ON CONFLICT (task) DO NOTHING;
