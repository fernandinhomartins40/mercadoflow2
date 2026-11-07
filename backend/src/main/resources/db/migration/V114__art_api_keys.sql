-- Chaves da API de temas de encarte (MCP do Codex). São da plataforma, não de
-- um mercado: quem cria é o superadmin. O banco guarda só o hash; a chave
-- aparece uma vez, na criação.
CREATE TABLE IF NOT EXISTS art_api_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(80) NOT NULL,
    key_hash      VARCHAR(64) NOT NULL UNIQUE,
    key_prefix    VARCHAR(16) NOT NULL,
    created_by    VARCHAR(255),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at  TIMESTAMP,
    calls         BIGINT NOT NULL DEFAULT 0,
    revoked_at    TIMESTAMP
);

DO $$
DECLARE
    app_role TEXT := 'mercadoflow_app';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON art_api_keys TO %I', app_role);
    END IF;
END $$;
