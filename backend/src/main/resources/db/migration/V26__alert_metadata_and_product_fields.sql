-- Enrich alerts with structured metadata (key metrics that generated the alert)
-- and denormalized product fields so the API response is self-contained.

ALTER TABLE alerts
    ADD COLUMN IF NOT EXISTS metadata        JSONB,
    ADD COLUMN IF NOT EXISTS product_name    VARCHAR(255),
    ADD COLUMN IF NOT EXISTS product_ean     VARCHAR(50),
    ADD COLUMN IF NOT EXISTS product_image   TEXT;

-- Index for dismissing old read alerts (cleanup job can use this)
CREATE INDEX IF NOT EXISTS idx_alerts_market_created
    ON alerts (market_id, created_at DESC);

-- Index for fast unread count per market
CREATE INDEX IF NOT EXISTS idx_alerts_market_unread
    ON alerts (market_id, is_read)
    WHERE is_read = false;
