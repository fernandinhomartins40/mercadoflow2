-- Estatística das consultas (o que pesa no banco). A biblioteca é carregada
-- pelo shared_preload_libraries do docker-compose.vps.yml; sem ela a extensão
-- existe mas não coleta, e nada quebra.
create extension if not exists pg_stat_statements;
