-- O gatilho que impede filial de filial era BEFORE UPDATE. Gatilho BEFORE faz o
-- Postgres travar a linha do mercado em modo exclusivo quando o UPDATE lista
-- colunas-chave (o Hibernate lista todas, inclusive cnpj). Com isso, qualquer
-- gravação que referencia o mercado em outra transação (eventos de assinatura
-- gravados em REQUIRES_NEW) esperava para sempre: a troca de plano pelo
-- superadmin travava. Como AFTER, a regra vale igual (a exceção desfaz a
-- operação) e a linha não fica travada além do normal.
DROP TRIGGER IF EXISTS trg_single_level_network ON markets;
CREATE TRIGGER trg_single_level_network
    AFTER INSERT OR UPDATE OF parent_market_id ON markets
    FOR EACH ROW EXECUTE FUNCTION assert_single_level_network();
