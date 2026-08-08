-- Corrige o tipo das colunas de classe em product_capital_metrics.
--
-- V31 declarou abc_class/xyz_class como char(1). O Postgres materializa isso
-- como bpchar, enquanto a entidade JPA as mapeia como String com length = 1,
-- que o Hibernate espera encontrar como varchar(1). Com
-- spring.jpa.hibernate.ddl-auto=validate, essa divergência derruba a subida do
-- backend:
--
--   Schema-validation: wrong column type encountered in column [abc_class]
--   in table [product_capital_metrics]; found [bpchar (Types#CHAR)],
--   but expecting [varchar(1) (Types#VARCHAR)]
--
-- Corrigido aqui, e não editando a V31, porque aquela migração já foi aplicada
-- em produção — alterar o arquivo mudaria o checksum e faria o Flyway falhar na
-- validação.
--
-- char(1) para varchar(1) é uma conversão sem perda: os valores já são de um
-- único caractere ('A'/'B'/'C' e 'X'/'Y'/'Z'), então não há padding a descartar.
--
-- Idempotente: o mesmo ALTER foi aplicado a quente em produção para destravar a
-- subida do backend, então aqui ele só roda onde ainda não foi aplicado.

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'product_capital_metrics'
          and column_name = 'abc_class'
          and data_type = 'character'
    ) then
        alter table product_capital_metrics
            alter column abc_class type varchar(1);
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_name = 'product_capital_metrics'
          and column_name = 'xyz_class'
          and data_type = 'character'
    ) then
        alter table product_capital_metrics
            alter column xyz_class type varchar(1);
    end if;
end $$;
