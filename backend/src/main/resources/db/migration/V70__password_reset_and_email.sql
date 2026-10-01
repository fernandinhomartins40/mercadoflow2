-- Assinaturas S0: recuperação de senha e e-mail transacional.

-- Link de "esqueci minha senha": guardamos só o hash; vale 30 minutos e uma vez.
CREATE TABLE password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMP NOT NULL,
    used_at     TIMESTAMP,
    request_ip  VARCHAR(64),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_password_reset_user ON password_reset_tokens (user_id, created_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON password_reset_tokens TO mercadoflow_app;
    END IF;
END $$;

-- E-mail transacional (Resend) no painel de chaves da plataforma. O "modelo
-- padrão" guarda o remetente (ex.: MercadoFlow <nao-responda@mercadoflow.com>).
INSERT INTO ai_platform_providers (provider, base_url, default_model, priority)
VALUES ('EMAIL', 'https://api.resend.com', 'MercadoFlow <nao-responda@mercadoflow.com>', 70)
ON CONFLICT (provider) DO NOTHING;
