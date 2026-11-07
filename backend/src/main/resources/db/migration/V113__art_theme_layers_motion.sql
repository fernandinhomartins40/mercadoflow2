-- Fundo em camadas e animação dos temas de encarte.
--
-- layers: PNGs do fundo de um formato, de trás para frente:
--   [{id, name, url, w, h, role: base|element, cx, cy, width, rotation, opacity, hidden, still}]
-- background_url continua sendo a imagem achatada (montada no navegador), usada
-- pela análise de áreas, pela paleta automática e pelas miniaturas.
ALTER TABLE art_theme_formats ADD COLUMN IF NOT EXISTS layers JSONB NOT NULL DEFAULT '[]'::jsonb;

-- animation: {presets: [...], defaultPreset, duration (segundos)}. Vazio = tema estático.
ALTER TABLE art_themes ADD COLUMN IF NOT EXISTS animation JSONB NOT NULL DEFAULT '{}'::jsonb;
