-- Cria o role que a aplicação deve usar em runtime: sem SUPERUSER e sem
-- BYPASSRLS.
--
-- Este é o furo que tornava o multi-inquilino decorativo. O PostgreSQL não
-- aplica row-level security a superusuários nem a roles com BYPASSRLS, e a
-- aplicação se conecta com um role que tem os dois. As 35 políticas de
-- tenant_isolation em produção estão corretas e nunca foram avaliadas: o
-- isolamento dependia inteiramente de cada consulta Java lembrar de filtrar por
-- mercado — e bastou um existsByChaveNFe sem escopo para um cliente perder
-- notas em silêncio.
--
-- A migração apenas PREPARA o role. Ela não troca a conexão: isso é feito pelo
-- DATABASE_USER/DATABASE_PASSWORD no deploy, para que a mudança seja reversível
-- sem rollback de schema. Enquanto o .env apontar para o role antigo, nada muda
-- em runtime.
--
-- A senha vem de app.mercadoflow_app_password quando definida
-- (-Dflyway.placeholders ou SET LOCAL); sem ela o role nasce NOLOGIN, de modo
-- que um deploy desatento não cria credencial previsível.

DO $$
DECLARE
    senha text := current_setting('app.mercadoflow_app_password', true);
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        IF senha IS NULL OR senha = '' THEN
            EXECUTE 'CREATE ROLE mercadoflow_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE';
            RAISE NOTICE 'Role mercadoflow_app criado sem senha (NOLOGIN). '
                'Defina a senha e habilite LOGIN antes de apontar a aplicação.';
        ELSE
            EXECUTE format(
                'CREATE ROLE mercadoflow_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
                senha
            );
        END IF;
    ELSE
        -- Role pode ter sido criado à mão antes desta migração; garante que não
        -- carregue os atributos que anulam o RLS.
        EXECUTE 'ALTER ROLE mercadoflow_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE';
    END IF;
END $$;

-- Permissões de uso, nunca de estrutura: DDL continua com o dono/Flyway.
GRANT USAGE ON SCHEMA public TO mercadoflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mercadoflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mercadoflow_app;

-- Tabelas criadas por migrações futuras já nascem acessíveis, senão o primeiro
-- deploy depois de um CREATE TABLE derruba a aplicação com permission denied.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mercadoflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO mercadoflow_app;

-- flyway_schema_history é do Flyway, que roda com o role administrativo.
REVOKE ALL ON TABLE flyway_schema_history FROM mercadoflow_app;
