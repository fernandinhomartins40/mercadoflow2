-- Fecha duas lacunas apontadas na auditoria de inteligência comercial:
--
--   1. campaign_products — a entidade Campaign nunca teve produtos vinculados,
--      então o "impacto da campanha" era medido sobre a receita da LOJA INTEIRA.
--      Qualquer feriado dentro da janela contaminava o resultado e não havia como
--      atribuir efeito, medir canibalização ou comparar edições da mesma promoção.
--
--   2. customer_profiles — invoices.cpf_cnpj_destinatario é gravado desde a V1 e
--      NUNCA foi lido por serviço analítico nenhum. Recompra, frequência e ticket
--      por cliente recorrente eram invisíveis, mesmo com o dado na mão.
--
-- Ambas entram na RLS por tenant, no mesmo padrão das 35 políticas em produção.

-- pgcrypto fornece hmac(), usada para pseudonimizar o CPF DENTRO do banco — o
-- documento nunca trafega até a aplicação. gen_random_uuid() já é nativa desde o
-- PostgreSQL 13, então a extensão é necessária apenas pelo HMAC.
-- IF NOT EXISTS mantém a migration idempotente onde ela já estiver instalada.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Produtos da campanha ────────────────────────────────────────────────
-- target_price permite medir o cumprimento da mecânica: o preço praticado na
-- janela bateu com o que a campanha prometia?
CREATE TABLE campaign_products (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id      UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    campaign_id    UUID NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    product_id     UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,

    target_price   NUMERIC(14,4),
    target_discount_percent NUMERIC(9,4),

    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_campaign_product UNIQUE (campaign_id, product_id)
);

CREATE INDEX idx_campaign_products_market ON campaign_products (market_id);
CREATE INDEX idx_campaign_products_campaign ON campaign_products (campaign_id);
CREATE INDEX idx_campaign_products_product ON campaign_products (market_id, product_id);

-- ── 2. Perfil de cliente (pseudonimizado) ──────────────────────────────────
-- LGPD: o CPF NUNCA é copiado para cá. A chave é um HMAC-SHA256 com salt por
-- tenant, o que permite reconhecer o cliente recorrente daquela loja sem
-- armazenar o documento nem permitir cruzamento entre lojas diferentes.
-- Base legal: legítimo interesse (análise de recorrência), com o dado
-- pseudonimizado desde a origem — ver §27 da auditoria.
CREATE TABLE customer_profiles (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id            UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,

    -- HMAC-SHA256(cpf, salt do tenant) em hexadecimal.
    customer_hash        VARCHAR(64) NOT NULL,

    first_purchase_at    TIMESTAMP,
    last_purchase_at     TIMESTAMP,
    purchase_count       INTEGER NOT NULL DEFAULT 0,
    total_spent          NUMERIC(14,2) NOT NULL DEFAULT 0,
    average_ticket       NUMERIC(14,2) NOT NULL DEFAULT 0,
    average_items        NUMERIC(10,2) NOT NULL DEFAULT 0,

    -- Dias médios entre compras: base da recorrência.
    avg_days_between     NUMERIC(10,2),

    -- RECORRENTE / OCASIONAL / UNICO — classificação derivada, ver
    -- CustomerIntelligenceService.
    segment              VARCHAR(16),

    computed_at          TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_customer_profile_market_hash UNIQUE (market_id, customer_hash)
);

CREATE INDEX idx_customer_profiles_market ON customer_profiles (market_id);
CREATE INDEX idx_customer_profiles_segment ON customer_profiles (market_id, segment);
CREATE INDEX idx_customer_profiles_last ON customer_profiles (market_id, last_purchase_at DESC);

-- Salt por tenant: fica separado do perfil para que o hash não possa ser
-- reproduzido só com acesso à tabela de perfis.
CREATE TABLE market_customer_salts (
    market_id   UUID PRIMARY KEY REFERENCES markets (id) ON DELETE CASCADE,
    salt        VARCHAR(64) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── 3. Recompra por produto ────────────────────────────────────────────────
-- Responde "este produto traz o cliente de volta?" — um item com alta taxa de
-- recompra sustenta a recorrência da loja e merece tratamento diferente de um
-- item de compra única, mesmo que ambos vendam o mesmo volume.
CREATE TABLE product_repurchase_stats (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id             UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    product_id            UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,

    distinct_customers    INTEGER NOT NULL DEFAULT 0,
    repurchasing_customers INTEGER NOT NULL DEFAULT 0,
    repurchase_rate       NUMERIC(9,4) NOT NULL DEFAULT 0,
    avg_days_between      NUMERIC(10,2),

    window_days           INTEGER NOT NULL DEFAULT 365,
    computed_at           TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_repurchase_market_product UNIQUE (market_id, product_id)
);

CREATE INDEX idx_repurchase_market ON product_repurchase_stats (market_id);
CREATE INDEX idx_repurchase_rate ON product_repurchase_stats (market_id, repurchase_rate DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- market_customer_salts fica de fora do laço: sua chave primária é market_id
-- (não há coluna market_id separada para a policy referenciar da mesma forma),
-- então recebe a política logo abaixo.
DO $$
DECLARE
    alvo TEXT;
    alvos TEXT[] := ARRAY[
        'campaign_products',
        'customer_profiles',
        'product_repurchase_stats'
    ];
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

ALTER TABLE market_customer_salts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON market_customer_salts;
CREATE POLICY tenant_isolation ON market_customer_salts FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
);
