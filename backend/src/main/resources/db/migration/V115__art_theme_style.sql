-- Estilo do tema de encarte: fontes, etiqueta de preço, cartão do produto,
-- nome e rodapé. Vazio = visual padrão (o de antes desta coluna existir).
ALTER TABLE art_themes ADD COLUMN IF NOT EXISTS style JSONB NOT NULL DEFAULT '{}'::jsonb;
