#!/bin/sh
# Cria/atualiza a role de aplicacao sujeita a Row-Level Security (pdv2cloud_app).
#
# Execucao automatica: montado em /docker-entrypoint-initdb.d no docker-compose,
# roda apenas no PRIMEIRO provisionamento do volume do Postgres.
#
# Bancos ja existentes: rode manualmente dentro do container do Postgres:
#   docker compose exec -e DATABASE_APP_PASSWORD=... postgres \
#     sh /docker-entrypoint-initdb.d/10-setup-tenant-roles.sh
#
# Requer: POSTGRES_USER, POSTGRES_DB (padrao do container) e DATABASE_APP_PASSWORD.
# Observacao: a senha nao deve conter aspas simples.
set -eu

APP_ROLE="${DATABASE_APP_USER:-pdv2cloud_app}"

if [ -z "${DATABASE_APP_PASSWORD:-}" ]; then
    echo "[setup-tenant-roles] ERRO: DATABASE_APP_PASSWORD nao definido; role de aplicacao nao criada." >&2
    exit 1
fi

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<EOSQL
do \$\$
begin
    if not exists (select from pg_roles where rolname = '${APP_ROLE}') then
        create role "${APP_ROLE}" login password '${DATABASE_APP_PASSWORD}'
            nosuperuser nocreatedb nocreaterole nobypassrls;
    else
        alter role "${APP_ROLE}" login password '${DATABASE_APP_PASSWORD}' nobypassrls;
    end if;
end
\$\$;

grant usage on schema public to "${APP_ROLE}";

-- Tabelas existentes (em provisionamento novo ainda nao ha tabelas; as futuras
-- sao cobertas pelos default privileges abaixo, pois o Flyway roda como ${POSTGRES_USER})
grant select, insert, update, delete on all tables in schema public to "${APP_ROLE}";
grant usage, select on all sequences in schema public to "${APP_ROLE}";

alter default privileges for role "${POSTGRES_USER}" in schema public
    grant select, insert, update, delete on tables to "${APP_ROLE}";
alter default privileges for role "${POSTGRES_USER}" in schema public
    grant usage, select on sequences to "${APP_ROLE}";
EOSQL

echo "[setup-tenant-roles] role ${APP_ROLE} configurada com sucesso."
