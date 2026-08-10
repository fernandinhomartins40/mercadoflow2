-- Chave de NF-e passa a ser única POR MERCADO, não globalmente.
--
-- A constraint anterior, UNIQUE (chave_nfe), tratava a chave como identificador
-- global do sistema. Na prática ela dizia "esta nota já existe em algum lugar do
-- SaaS", e o InvoiceProcessingService respondia DUPLICATE sem gravar. O agente
-- do segundo mercado recebia sucesso, marcava a nota como enviada e seguia em
-- frente: a nota sumia sem erro em lugar nenhum.
--
-- Foi exatamente o que aconteceu em produção — um mercado novo reenviou chaves
-- que já existiam para outro mercado e não recebeu nenhuma das suas notas,
-- enquanto o painel do agente exibia centenas de "enviadas".
--
-- Em NF-e legítima a chave carrega o CNPJ do emitente, então a colisão entre
-- lojas distintas é rara; mas "rara" não é "impossível" (nota do mesmo emitente
-- coletada por duas filiais, XMLs de homologação, reprocessamento) e o modo de
-- falha é perda silenciosa de dados do cliente. A unicidade correta para um
-- sistema multi-inquilino é por inquilino.

-- Idempotente: o deploy anterior pode ter falhado após esta etapa.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_chave_nfe_key;

-- Sem CONCURRENTLY: dentro da transação do Flyway ele não é permitido, e a
-- tabela é pequena o bastante para o lock ser irrelevante no deploy.
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_chave_nfe_market
    ON invoices (chave_nfe, market_id);

COMMENT ON INDEX ux_invoices_chave_nfe_market IS
    'Chave de NF-e é única por mercado. Global impedia que dois mercados '
    'coletassem a mesma chave e fazia o segundo perder a nota em silêncio.';
