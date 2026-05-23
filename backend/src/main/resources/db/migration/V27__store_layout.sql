-- Store layout: persiste o grid de seções da loja no servidor.
-- O layout é armazenado como um array JSON de células (row, col, sectionName, categorySlug)
-- para que o frontend possa reconstruir o mapa sem schema rígido de posições.

CREATE TABLE IF NOT EXISTS store_layouts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id   UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    grid_cols   INTEGER NOT NULL DEFAULT 4,
    grid_rows   INTEGER NOT NULL DEFAULT 5,
    cells       JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (market_id)
);

CREATE INDEX IF NOT EXISTS idx_store_layouts_market ON store_layouts (market_id);
