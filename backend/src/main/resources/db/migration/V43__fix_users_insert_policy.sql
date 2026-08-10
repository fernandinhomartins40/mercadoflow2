-- Corrige a política de users, que impedia qualquer INSERT.
--
-- A V42 criou users_modify com USING mas sem WITH CHECK. São coisas distintas:
-- USING filtra linhas que JÁ existem (SELECT/UPDATE/DELETE), enquanto WITH CHECK
-- valida a linha que está ENTRANDO (INSERT/UPDATE). Sem WITH CHECK o PostgreSQL
-- recusa todo INSERT, e o cadastro público passou a responder 500:
--   new row violates row-level security policy for table "users"
--
-- O erro só apareceu quando a aplicação passou a conectar com uma role sem
-- BYPASSRLS — antes disso a política existia e nunca era avaliada.

DROP POLICY IF EXISTS users_modify ON users;
DROP POLICY IF EXISTS users_select ON users;

-- Leitura liberada: o login busca por e-mail antes de existir tenant na sessão,
-- e é essa consulta que descobre a qual mercado o usuário pertence. O recorte
-- por mercado nas listagens é feito na camada Java.
CREATE POLICY users_select ON users FOR SELECT USING (true);

-- Escrita restrita ao próprio mercado, agora nas duas pontas.
CREATE POLICY users_modify ON users FOR ALL
    USING (
        current_setting('app.is_admin', true) = 'true'
        OR market_id IS NULL
        OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.is_admin', true) = 'true'
        OR market_id IS NULL
        OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
    );

-- O mesmo defeito atinge todas as políticas criadas pela V40 e V42: nenhuma
-- delas declarou WITH CHECK, então a ingestão de notas e qualquer outra escrita
-- em tabela de tenant estariam recusadas. Recriadas em bloco pelo catálogo, para
-- não depender de lista manual.
DO $$
DECLARE
    t record;
    regra text := 'current_setting(''app.is_admin'', true) = ''true'''
               || ' OR market_id = NULLIF(current_setting(''app.current_market'', true), '''')::uuid';
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
                           AND a.attname = 'market_id'
                           AND a.attnum > 0
                           AND NOT a.attisdropped
        JOIN pg_policy p ON p.polrelid = c.oid AND p.polname = 'tenant_isolation'
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND p.polwithcheck IS NULL   -- só as que estão sem WITH CHECK
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.relname);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING (%s) WITH CHECK (%s)',
            t.relname, regra, regra
        );
        RAISE NOTICE 'WITH CHECK adicionado em %', t.relname;
    END LOOP;
END $$;

-- Tabelas-filhas isolam por subconsulta ao pai, em vez de market_id próprio, e
-- por isso escaparam do bloco acima. Sofrem do mesmo defeito: sem WITH CHECK, a
-- ingestão gravaria a nota e falharia nos itens dela.
--
-- Reaproveita o USING existente como WITH CHECK — a mesma condição que autoriza
-- ler a linha autoriza criá-la, que é o comportamento pretendido.
DO $$
DECLARE
    t record;
    condicao text;
BEGIN
    FOR t IN
        SELECT c.relname, pg_get_expr(p.polqual, p.polrelid) AS usando
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_policy p ON p.polrelid = c.oid AND p.polname = 'tenant_isolation'
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND p.polwithcheck IS NULL
    LOOP
        condicao := t.usando;
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.relname);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING (%s) WITH CHECK (%s)',
            t.relname, condicao, condicao
        );
        RAISE NOTICE 'WITH CHECK (via pai) adicionado em %', t.relname;
    END LOOP;
END $$;
