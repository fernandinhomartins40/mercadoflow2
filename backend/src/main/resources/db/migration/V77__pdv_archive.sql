-- Caixa removido pelo lojista: sem notas, é apagado; com notas, fica arquivado
-- para o histórico de vendas continuar apontando para ele, mas some da lista e
-- deixa de contar no limite de caixas do plano.
ALTER TABLE pdvs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
