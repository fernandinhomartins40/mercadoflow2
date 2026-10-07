-- F0 do plano de experiência (docs/AUDITORIA-EXPERIENCIA-E-PLANO.md, 07/10/2026):
-- só chega ao dono o que tem valor e confiança. Nada é apagado; o que sai da
-- fila fica como EXPIRADA (recomendação) ou CONCLUIDA por correção (oportunidade),
-- e volta sozinho se a situação for detectada de novo com dado suficiente.

-- 1. Excesso, parado e compra sem estoque conhecido: não há o que afirmar.
update opportunities
   set status = 'CONCLUIDA', status_changed_at = now(),
       status_changed_by = 'correcao F0: sem estoque conhecido'
 where status in ('NOVA', 'VISTA')
   and type in ('EXCESSO_DE_ESTOQUE', 'CAPITAL_PARADO', 'OPORTUNIDADE_DE_COMPRA')
   and coalesce(nullif(evidence ->> 'confiancaEstoque', '')::numeric, 0) < 0.30;

-- 2. Pico de vendas é bom sinal, não decisão.
update recommendations r
   set status = 'EXPIRADA'
  from opportunities o
 where o.id = r.opportunity_id and r.status = 'PROPOSTA'
   and o.type = 'ANOMALIA_DE_VENDAS'
   and coalesce(nullif(o.evidence ->> 'desvioPercent', '')::numeric, 0) > 0;

-- 3. Órfãs (a situação acabou) e as sem valor ou sem confiança.
update recommendations r
   set status = 'EXPIRADA'
 where r.status = 'PROPOSTA'
   and (
        not exists (select 1 from opportunities o where o.id = r.opportunity_id and o.status in ('NOVA', 'VISTA', 'EM_ACAO'))
        or coalesce(r.expected_impact_value, 0) <= 0
        or (r.confidence is not null and r.confidence < 0.30)
   );
