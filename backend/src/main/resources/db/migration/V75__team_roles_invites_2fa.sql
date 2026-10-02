-- Assinaturas S4: equipe. Papel por função (Dono, Gerente, Comprador, Conferente,
-- Financeiro, Leitura), convites por e-mail com aceite, transferência de
-- titularidade com confirmação dos dois lados e verificação em duas etapas.

-- Papel de equipe. O papel de sistema (MARKET_OWNER/MARKET_MANAGER) continua
-- valendo para as rotas; o papel de equipe refina o que cada um pode fazer.
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_role VARCHAR(16);
UPDATE users SET team_role = CASE role WHEN 'MARKET_OWNER' THEN 'DONO' WHEN 'MARKET_MANAGER' THEN 'GERENTE' END
 WHERE team_role IS NULL AND role IN ('MARKET_OWNER', 'MARKET_MANAGER');

-- Verificação em duas etapas (TOTP): segredo cifrado e códigos de recuperação (hash).
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_hashes TEXT;

-- Convites: o link (token) vale 7 dias e só uma vez.
CREATE TABLE team_invites (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id    UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,   -- loja onde a pessoa vai trabalhar
    email        VARCHAR(255) NOT NULL,
    name         VARCHAR(120),
    team_role    VARCHAR(16) NOT NULL,
    token_hash   VARCHAR(64) NOT NULL UNIQUE,
    expires_at   TIMESTAMP NOT NULL,
    invited_by   VARCHAR(255),
    accepted_at  TIMESTAMP,
    revoked_at   TIMESTAMP,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_team_invites_market ON team_invites (market_id, created_at DESC);
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON team_invites;
CREATE POLICY tenant_isolation ON team_invites FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
    OR (SELECT parent_market_id FROM markets WHERE id = team_invites.market_id) = NULLIF(current_setting('app.current_market', true), '')::uuid);

-- Transferência de titularidade: o dono pede (com a senha), o novo dono aceita.
CREATE TABLE ownership_transfers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id     UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,  -- matriz da rede
    from_user_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    to_user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status        VARCHAR(12) NOT NULL DEFAULT 'PENDING',  -- PENDING | ACCEPTED | DECLINED | CANCELED | EXPIRED
    expires_at    TIMESTAMP NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    decided_at    TIMESTAMP
);
CREATE INDEX idx_ownership_transfers_to ON ownership_transfers (to_user_id, status);

-- Segunda etapa do login: desafio curto, até 5 tentativas.
CREATE TABLE mfa_challenges (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    keep        BOOLEAN NOT NULL DEFAULT FALSE,
    attempts    INT NOT NULL DEFAULT 0,
    expires_at  TIMESTAMP NOT NULL,
    used_at     TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON team_invites, ownership_transfers, mfa_challenges TO mercadoflow_app;
    END IF;
END $$;
