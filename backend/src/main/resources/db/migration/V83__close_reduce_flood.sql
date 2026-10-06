-- 06/10/2026: a primeira rodada com a série do calendário deu ritmo 0 a milhares
-- de itens de venda esporádica e abriu 2.918 "Reduzir compra" (EXCESSO_DE_ESTOQUE)
-- com estoque desconhecido. O cálculo foi corrigido (ritmo só com >= 14 dias de
-- venda; "reduzir" só para curva A/B ou estoque conhecido). Fecha a enxurrada;
-- as que continuarem valendo são reabertas pela próxima detecção.
update opportunities
   set status = 'CONCLUIDA',
       status_changed_at = now(),
       status_changed_by = 'correcao 2026-10-06: ritmo de venda esporadica'
 where type = 'EXCESSO_DE_ESTOQUE'
   and status in ('NOVA', 'VISTA')
   and coalesce(nullif(evidence ->> 'confiancaEstoque', '')::numeric, 0) = 0;
