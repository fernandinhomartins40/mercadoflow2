-- E-mail transacional: o provedor passa a ser o VeloMail (chave nova, cadastrada
-- depois no painel; a do Resend nunca chegou a ser cadastrada em produção).
UPDATE ai_platform_providers
   SET base_url = 'https://www.velomail.com.br/api', last_check_at = NULL, last_check_ok = NULL, last_check_error = NULL, updated_at = NOW()
 WHERE provider = 'EMAIL';

-- Confirmação de e-mail do cadastro: não bloqueia o acesso (freemium entra na
-- hora), só registra que o endereço é da pessoa. Contas antigas ficam nulas.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMP;

-- Guardamos só o hash do link, como em password_reset_tokens.
CREATE TABLE email_confirmation_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMP NOT NULL,
    used_at     TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_confirmation_user ON email_confirmation_tokens (user_id, created_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON email_confirmation_tokens TO mercadoflow_app;
    END IF;
END $$;
