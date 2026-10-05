-- invoice_items nunca teve índice pela nota. Com a RLS, o planejador estima
-- uma linha por nota e escolhe laço aninhado: cada nota varre os itens
-- inteiros. Medido no agregado da indústria: 2,3 s para um dia de 170 notas
-- com 39 mil itens. O índice também serve à política de RLS dos itens
-- (EXISTS na nota) e a toda tela que abre os itens de uma nota.
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items (invoice_id);

-- O agregado lê todas as lojas por período: o índice existente começa pelo mercado.
CREATE INDEX IF NOT EXISTS idx_invoices_data_emissao ON invoices (data_emissao);
