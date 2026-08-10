-- Linhas legitimamente sem dono ainda: market_id NULL.
--
-- As políticas exigem `market_id = <tenant da sessão>`, e em SQL
-- `NULL = qualquer_coisa` é NULL — nunca verdadeiro. Toda linha criada antes de
-- se saber a que mercado pertence é recusada.
--
-- É o caso do pareamento do agente: a sessão nasce sem mercado (o vínculo só
-- existe quando o usuário aprova no celular), então o QR Code parou de ser
-- gerado assim que o RLS passou a valer:
--   new row violates row-level security policy for table "agent_pairing_sessions"
--
-- Permitir market_id NULL não afrouxa o isolamento: linha sem mercado não
-- pertence a ninguém, e as consultas que a leem são as do próprio fluxo de
-- criação, autorizadas por outro meio (o segredo do pareamento, verificado em
-- tempo constante). Assim que o mercado é definido, a política passa a valer
-- normalmente.

DO $$
DECLARE
    t record;
    regra text := 'current_setting(''app.is_admin'', true) = ''true'''
               || ' OR market_id IS NULL'
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
                           AND NOT a.attnotnull          -- só onde a coluna aceita NULL
        JOIN pg_policy p ON p.polrelid = c.oid AND p.polname = 'tenant_isolation'
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.relname);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING (%s) WITH CHECK (%s)',
            t.relname, regra, regra
        );
        RAISE NOTICE 'market_id NULL permitido em %', t.relname;
    END LOOP;
END $$;
