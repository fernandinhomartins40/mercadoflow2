-- O pedido pode ser montado antes de escolher o fornecedor; o fornecedor só é exigido para enviar.
alter table supplier_orders alter column supplier_id drop not null;

-- A lista de compras guarda a embalagem de cada produto: unidade, caixa, fardo, dúzia, pacote ou kg.
alter table shopping_list_items add column if not exists unit_type varchar(10) not null default 'UN';
alter table shopping_list_items add column if not exists units_per_pack numeric(10,3);
