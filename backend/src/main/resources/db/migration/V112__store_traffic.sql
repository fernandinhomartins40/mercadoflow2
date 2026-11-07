-- Mapa de calor das câmeras: o app no computador da loja analisa o vídeo ali e
-- só manda isto: segundos de presença por célula de 50 cm da planta, por hora e
-- por câmera. Nenhuma imagem, rosto ou identificador de pessoa sai da loja.
-- bucket_start é a hora local da loja. O valor é o acumulado daquela hora: o app
-- reenvia sem somar duas vezes.
CREATE TABLE store_traffic_cells (
    market_id     UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    camera_id     VARCHAR(40) NOT NULL,
    bucket_start  TIMESTAMP NOT NULL,
    cell_x        SMALLINT NOT NULL,
    cell_y        SMALLINT NOT NULL,
    seconds       NUMERIC(10, 1) NOT NULL,
    received_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (market_id, camera_id, bucket_start, cell_x, cell_y)
);
CREATE INDEX idx_store_traffic_period ON store_traffic_cells (market_id, bucket_start);

ALTER TABLE store_traffic_cells ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON store_traffic_cells;
CREATE POLICY tenant_isolation ON store_traffic_cells FOR ALL
    USING (current_setting('app.is_admin', true) = 'true' OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid)
    WITH CHECK (current_setting('app.is_admin', true) = 'true' OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON store_traffic_cells TO mercadoflow_app;
    END IF;
END $$;
