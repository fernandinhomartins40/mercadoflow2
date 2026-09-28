-- Estúdio de encartes (ciclo 7).
--
-- O editor antigo (offer_*) desenhava a arte duas vezes — uma no navegador e
-- outra em Java — e o arquivo final saía diferente da prévia. Aqui a arte é
-- desenhada só no navegador; o banco guarda o tema (fundo por formato + áreas
-- de logo, produtos, rodapé e selo), a marca do mercado e as campanhas.
-- As tabelas offer_* ficam intactas.

-- ── Plataforma (sem tenant) ─────────────────────────────────────────────────

-- Chave de IA da plataforma, usada pelo criador de temas do superadmin. Uma
-- linha por uso (hoje só 'ART_THEMES'). Chave cifrada em AES-GCM com a mesma
-- chave mestra do BYOK; a API devolve apenas key_hint.
CREATE TABLE platform_ai_settings (
    purpose            VARCHAR(32) PRIMARY KEY,
    provider           VARCHAR(24) NOT NULL,
    model              VARCHAR(120) NOT NULL,
    encrypted_api_key  TEXT,
    key_hint           VARCHAR(8),
    updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by         VARCHAR(255)
);

CREATE TABLE art_themes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(120) NOT NULL,
    occasion     VARCHAR(60),
    tags         JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Cores da etiqueta de preço, do cartão e do texto: {tag, tagText, card, cardText, accent}.
    palette      JSONB NOT NULL DEFAULT '{}'::jsonb,
    seal_url     VARCHAR(500),
    seal_width   INT,
    seal_height  INT,
    -- DRAFT: só o superadmin vê. PUBLISHED: aparece para os mercados.
    status       VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Um fundo por formato (story, post, quadrado, A4, TV). As áreas ficam em
-- coordenadas de 0 a 1 sobre o fundo: {logo, products, footer, seal}.
CREATE TABLE art_theme_formats (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    theme_id        UUID NOT NULL REFERENCES art_themes (id) ON DELETE CASCADE,
    format          VARCHAR(16) NOT NULL,
    background_url  VARCHAR(500) NOT NULL,
    width           INT NOT NULL,
    height          INT NOT NULL,
    regions         JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- O que a análise (pixels + IA) encontrou, para auditoria e refazer.
    analysis        JSONB,
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_art_theme_format UNIQUE (theme_id, format)
);

CREATE INDEX idx_art_themes_status ON art_themes (status, sort_order);

-- ── Mercado (com tenant) ────────────────────────────────────────────────────

CREATE TABLE art_market_brands (
    market_id     UUID PRIMARY KEY REFERENCES markets (id) ON DELETE CASCADE,
    display_name  VARCHAR(120),
    logo_url      VARCHAR(500),
    address_line  VARCHAR(200),
    phone         VARCHAR(40),
    whatsapp      VARCHAR(40),
    instagram     VARCHAR(60),
    footer_note   VARCHAR(240),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE art_campaigns (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id         UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    title             VARCHAR(160) NOT NULL,
    theme_id          UUID REFERENCES art_themes (id) ON DELETE SET NULL,
    -- Produtos, destaques e opções da arte (formato, selo escondido...).
    content           JSONB NOT NULL DEFAULT '{}'::jsonb,
    valid_from        DATE,
    valid_until       DATE,
    status            VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    public_slug       VARCHAR(40),
    -- Artes publicadas: [{format, url}].
    published_images  JSONB NOT NULL DEFAULT '[]'::jsonb,
    published_at      TIMESTAMP,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_art_campaign_slug UNIQUE (public_slug)
);

CREATE INDEX idx_art_campaigns_market ON art_campaigns (market_id, updated_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE art_market_brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON art_market_brands;
CREATE POLICY tenant_isolation ON art_market_brands FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
);

ALTER TABLE art_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON art_campaigns;
CREATE POLICY tenant_isolation ON art_campaigns FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
);

DO $$
DECLARE
    app_role TEXT := 'mercadoflow_app';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON platform_ai_settings, art_themes, '
            'art_theme_formats, art_market_brands, art_campaigns TO %I', app_role);
    END IF;
END $$;
