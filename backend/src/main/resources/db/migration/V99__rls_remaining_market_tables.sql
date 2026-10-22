-- RLS nas 8 tabelas com market_id que ficaram sem política (SEC-E).
--
-- A V42 varreu o catálogo e pôs a política em toda tabela com market_id que
-- existia naquele momento. As tabelas abaixo nasceram depois (V61, V75, V76,
-- V85, V94, V95) e nenhuma migration voltou a varrer o catálogo, então ficaram
-- sem RLS em produção. O código filtra por mercado em todas; isto é defesa em
-- profundidade.
--
-- Mesma regra das políticas existentes (V43/V44):
--   - app.is_admin = 'true' (superadmin e TenantContext.runAsSystem) vê tudo;
--   - a sessão da loja vê e grava só as linhas do próprio mercado;
--   - onde market_id aceita NULL, a linha sem dono continua permitida, como a
--     V44 faz para as demais tabelas de coluna anulável.
--
-- Caminhos de acesso conferidos (detalhe em docs/pie/lotes/receita.md, Lote 2):
--   ai_pilot_markets            superadmin (bypass) e AiGate.isPilot no mercado da sessão ou como sistema
--   billing_exceptions          superadmin; webhook do Asaas (runAsSystem); checkout grava com market_id NULL
--   billing_payments            webhook do Asaas (runAsSystem); superadmin
--   commerce_campaign_targets   portal de vendas (runAsSystem)
--   commerce_price_list_markets portal de vendas (runAsSystem); loja lê só a linha dela (lm.market_id = loja da sessão)
--   ownership_transfers         TeamController e MyAccountController, sempre em runAsSystem
--   partner_connect_requests    runAsSystem; aprovação grava market_id = loja da sessão (mesma regra de partner_market_links)
--   partner_idempotency         PartnerApiController, sempre em runAsSystem
-- Os jobs rodam no contêiner mercadoflow-cron com a role dona do schema, que
-- não é afetada pelo RLS.

DO $$
DECLARE
    t text;
    regra text := 'current_setting(''app.is_admin'', true) = ''true'''
               || ' OR market_id = NULLIF(current_setting(''app.current_market'', true), '''')::uuid';
    regra_nulo text := 'current_setting(''app.is_admin'', true) = ''true'''
               || ' OR market_id IS NULL'
               || ' OR market_id = NULLIF(current_setting(''app.current_market'', true), '''')::uuid';
BEGIN
    -- market_id NOT NULL
    FOREACH t IN ARRAY ARRAY['ai_pilot_markets', 'commerce_campaign_targets', 'commerce_price_list_markets',
                             'ownership_transfers', 'partner_idempotency']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING (%s) WITH CHECK (%s)', t, regra, regra);
        RAISE NOTICE 'RLS habilitado em %', t;
    END LOOP;

    -- market_id anulável
    FOREACH t IN ARRAY ARRAY['billing_exceptions', 'billing_payments', 'partner_connect_requests']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING (%s) WITH CHECK (%s)', t, regra_nulo, regra_nulo);
        RAISE NOTICE 'RLS habilitado em % (market_id NULL permitido)', t;
    END LOOP;
END $$;
