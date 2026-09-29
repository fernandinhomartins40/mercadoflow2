-- Ícones do PWA do Confere configurados pelo superadmin (recorte 1:1 no navegador,
-- que gera os tamanhos que Android e iPhone pedem). Sem eles, valem os ícones padrão
-- de /confere-app/.
ALTER TABLE confere_settings
    ADD COLUMN IF NOT EXISTS icon_192_url       VARCHAR(500),
    ADD COLUMN IF NOT EXISTS icon_512_url       VARCHAR(500),
    ADD COLUMN IF NOT EXISTS icon_maskable_url  VARCHAR(500),
    ADD COLUMN IF NOT EXISTS icon_apple_url     VARCHAR(500),
    ADD COLUMN IF NOT EXISTS icon_background    VARCHAR(7),
    ADD COLUMN IF NOT EXISTS icon_updated_at    TIMESTAMP;
