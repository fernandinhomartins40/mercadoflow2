-- Auditoria de 06/10/2026 (docs/AUDITORIA-ANALISES.md, 4.1): sem nenhuma compra
-- registrada, o estoque era gravado como ZERO em vez de desconhecido, a
-- cobertura dava 0 dia e todo produto vendido virava "Comprar X unidades".
-- O código foi corrigido; aqui se encerram as sugestões que nasceram desse erro
-- (confiança de estoque zero). As recomendações ligadas a elas deixam de
-- aparecer porque a lista de pendentes passou a exigir oportunidade aberta.
update opportunities
   set status = 'CONCLUIDA',
       status_changed_at = now(),
       status_changed_by = 'auditoria 2026-10-06: estoque desconhecido'
 where type = 'OPORTUNIDADE_DE_COMPRA'
   and status in ('NOVA', 'VISTA')
   and coalesce(nullif(evidence ->> 'confiancaEstoque', '')::numeric, 0) = 0;

-- "Capital parado" (liquidar) afirma mercadoria parada; com estoque desconhecido
-- não há o que liquidar.
update opportunities
   set status = 'CONCLUIDA',
       status_changed_at = now(),
       status_changed_by = 'auditoria 2026-10-06: estoque desconhecido'
 where type = 'CAPITAL_PARADO'
   and status in ('NOVA', 'VISTA')
   and coalesce(nullif(evidence ->> 'confiancaEstoque', '')::numeric, 0) = 0;
