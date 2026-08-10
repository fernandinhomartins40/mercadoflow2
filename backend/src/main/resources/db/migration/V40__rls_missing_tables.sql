-- Estende o RLS às tabelas com market_id que ficaram sem política.
--
-- O isolamento por linha foi aplicado fora do Flyway (35 tabelas em produção),
-- e estas quatro passaram batido mesmo tendo market_id. Como o Flyway não tem
-- registro de nada disso, as políticas ficam aqui: reproduzir o ambiente do
-- zero hoje geraria um banco sem isolamento nenhum.
--
-- IMPORTANTE: política ativa não basta. O PostgreSQL ignora RLS para
-- superusuários e para roles com BYPASSRLS, e é assim que a aplicação se
-- conecta hoje — as políticas existem e nunca são avaliadas. A criação do role
-- restrito está em V41; sem ela, este arquivo é documentação, não defesa.

DO $$
DECLARE
    alvo text;
BEGIN
    FOREACH alvo IN ARRAY ARRAY[
        'agent_api_keys',
        'subscription_events',
        'customer_activities',
        'customer_tasks'
    ] LOOP
        -- to_regclass evita falhar se a tabela ainda não existir no ambiente.
        IF to_regclass('public.' || alvo) IS NULL THEN
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', alvo);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', alvo);

        -- Mesma forma das 35 políticas já em produção: admin enxerga tudo,
        -- os demais só o próprio mercado. NULLIF trata a sessão sem tenant
        -- ('') como ausência de acesso em vez de erro de cast.
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING ('
            || 'current_setting(''app.is_admin'', true) = ''true'''
            || ' OR market_id = NULLIF(current_setting(''app.current_market'', true), '''')::uuid'
            || ')',
            alvo
        );
    END LOOP;
END $$;
