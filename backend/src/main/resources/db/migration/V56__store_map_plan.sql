-- Loja Viva: planta da loja vista de cima (móveis reais — gôndola, ponta,
-- geladeira, freezer, ilha, banca, balcão, caixas, entrada — e os setores de
-- cada um). Substitui a grade de quadrados em que o dono digitava categorias.
-- A coluna cells (grade antiga) fica intacta; store_layouts já tem RLS.

ALTER TABLE store_layouts ADD COLUMN IF NOT EXISTS plan JSONB;
