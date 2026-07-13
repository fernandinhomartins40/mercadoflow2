-- Fase 1 do plano multi-tenant (achado D-2 da auditoria):
-- market_id passa a ser NOT NULL nas tabelas transacionais criadas nullable em V1.
-- A migration aborta se existirem registros orfaos (sem tenant); nesse caso a
-- limpeza deve ser feita manualmente antes do deploy, decidindo caso a caso.

do $$
declare
    orphan_count bigint;
begin
    select
        (select count(*) from sales_analytics where market_id is null)
      + (select count(*) from alerts where market_id is null)
      + (select count(*) from campaigns where market_id is null)
      + (select count(*) from pdvs where market_id is null)
    into orphan_count;

    if orphan_count > 0 then
        raise exception
            'V28: % registro(s) sem market_id em sales_analytics/alerts/campaigns/pdvs. Limpe os orfaos antes de aplicar esta migration.',
            orphan_count;
    end if;
end $$;

alter table sales_analytics alter column market_id set not null;
alter table alerts alter column market_id set not null;
alter table campaigns alter column market_id set not null;
alter table pdvs alter column market_id set not null;
