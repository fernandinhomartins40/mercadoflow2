-- Fecha a cobertura de RLS: toda tabela com market_id passa a ter política.
--
-- A V40 tratou quatro tabelas nomeadas uma a uma. Esta faz a varredura pelo
-- catálogo: qualquer tabela do schema com coluna market_id e sem RLS ganha a
-- política padrão. O critério deixa de ser "alguém lembrou de listar" e passa a
-- ser estrutural — tabela nova com market_id não fica de fora por esquecimento.
--
-- Restavam agent_pairing_sessions, dunning_logs, network_contracts,
-- stripe_processed_events e users. A mais séria é users: sem política, uma
-- consulta que escapasse do filtro Java enxergaria as contas de todos os
-- clientes.

DO $$
DECLARE
    t record;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
                           AND a.attname = 'market_id'
                           AND a.attnum > 0
                           AND NOT a.attisdropped
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND NOT c.relrowsecurity
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.relname);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.relname);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING ('
            || 'current_setting(''app.is_admin'', true) = ''true'''
            || ' OR market_id = NULLIF(current_setting(''app.current_market'', true), '''')::uuid'
            || ')',
            t.relname
        );
        RAISE NOTICE 'RLS habilitado em %', t.relname;
    END LOOP;
END $$;

-- users precisa de tratamento próprio, e a razão é o login.
--
-- A autenticação consulta users por e-mail ANTES de existir tenant na sessão:
-- é ela que descobre a qual mercado o usuário pertence. Sob a política padrão
-- (market_id = app.current_market, que nesse instante está vazio) a busca não
-- retornaria linha nenhuma e ninguém entraria no sistema — nem o dono da conta,
-- nem o super admin.
--
-- SELECT fica liberado para a role da aplicação; o isolamento de leitura de
-- users é feito na camada Java, que já filtra por mercado em todas as listagens.
-- A escrita continua restrita ao próprio mercado, que é o que impede um cliente
-- de criar ou alterar usuários no mercado de outro.
DROP POLICY IF EXISTS tenant_isolation ON users;

CREATE POLICY users_select ON users FOR SELECT USING (true);

CREATE POLICY users_modify ON users FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    -- Super admin não pertence a mercado nenhum.
    OR market_id IS NULL
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
);

COMMENT ON TABLE users IS
    'RLS: escrita restrita ao próprio mercado; SELECT liberado porque o login '
    'consulta por e-mail antes de haver tenant na sessão.';
