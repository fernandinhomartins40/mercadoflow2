CREATE TABLE supplier_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id       UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    supplier_id     UUID NOT NULL REFERENCES suppliers(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO',
    order_number    VARCHAR(50) NOT NULL,
    order_date      TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMP,
    delivered_at    TIMESTAMP,
    cancelled_at    TIMESTAMP,
    cancel_reason   VARCHAR(500),
    total_value     NUMERIC(14,4) DEFAULT 0,
    notes           VARCHAR(1000),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP,
    CONSTRAINT uq_supplier_order_number UNIQUE (market_id, order_number)
);

CREATE TABLE supplier_order_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_order_id   UUID NOT NULL REFERENCES supplier_orders(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id),
    quantity_requested  NUMERIC(14,3) NOT NULL,
    quantity_received   NUMERIC(14,3),
    unit_type           VARCHAR(10) NOT NULL DEFAULT 'UN',
    units_per_pack      NUMERIC(10,3),
    unit_cost           NUMERIC(14,4) NOT NULL,
    unit_sale_price     NUMERIC(14,4),
    margin_percent      NUMERIC(8,4),
    subtotal            NUMERIC(14,4),
    note                VARCHAR(500),
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP
);

CREATE INDEX idx_supplier_orders_market_status  ON supplier_orders(market_id, status, order_date DESC);
CREATE INDEX idx_supplier_orders_market_supplier ON supplier_orders(market_id, supplier_id);
CREATE INDEX idx_supplier_order_items_order      ON supplier_order_items(supplier_order_id);
CREATE INDEX idx_supplier_order_items_product    ON supplier_order_items(product_id);

-- Rastrear qual pedido gerou cada entrada de histórico de compra
ALTER TABLE purchase_price_history
    ADD COLUMN IF NOT EXISTS supplier_order_id      UUID REFERENCES supplier_orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS supplier_order_item_id UUID REFERENCES supplier_order_items(id) ON DELETE SET NULL;
