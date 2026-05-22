-- Histórico de preços de compra registrados no momento do pedido inteligente
create table purchase_price_history (
    id uuid primary key default gen_random_uuid(),
    market_id uuid not null references markets(id) on delete cascade,
    product_id uuid not null references products(id) on delete cascade,
    shopping_list_item_id uuid references shopping_list_items(id) on delete set null,
    quantity_purchased numeric(14, 3) not null default 1,
    unit_cost numeric(14, 4) not null,           -- preço pago ao fornecedor por unidade
    unit_sale_price numeric(14, 4),              -- preço de venda definido no ato da compra
    margin_percent numeric(8, 4),               -- margem calculada: (venda - custo) / custo * 100
    supplier_name varchar(255),
    note varchar(1000),
    purchased_at timestamp not null default now(),
    created_at timestamp not null default now()
);

create index idx_purchase_price_history_market_product
    on purchase_price_history (market_id, product_id, purchased_at desc);

create index idx_purchase_price_history_item
    on purchase_price_history (shopping_list_item_id);

-- Adiciona custo unitário e preço de venda no item da lista (preenchido ao registrar compra)
alter table shopping_list_items
    add column if not exists unit_cost numeric(14, 4),
    add column if not exists unit_sale_price numeric(14, 4),
    add column if not exists quantity_purchased numeric(14, 3);
