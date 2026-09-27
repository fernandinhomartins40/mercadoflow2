-- Aceitar uma recomendação de compra coloca o produto no rascunho de pedido
-- do fornecedor (D-011). O vínculo fica na recomendação para o "desfazer"
-- saber o que reverter:
--   order_item_id           item criado ou ajustado pela aceitação;
--   order_item_previous_qty quantidade que o item tinha antes (NULL = o item
--                           foi criado pela aceitação e o desfazer o remove).
--
-- ON DELETE SET NULL: se o comprador apagar o item ou o rascunho à mão, a
-- recomendação continua aceita e o desfazer só deixa de mexer no pedido.
-- Colunas novas em tabela que já tem RLS (V46/V51) herdam a política.

ALTER TABLE recommendations
    ADD COLUMN IF NOT EXISTS order_item_id UUID
        REFERENCES supplier_order_items (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS order_item_previous_qty NUMERIC(14, 3);
