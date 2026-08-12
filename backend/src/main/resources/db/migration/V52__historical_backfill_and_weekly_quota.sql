-- Carga histórica livre + cota semanal (decisão do dono, 11/08/2026).
--
-- O PROBLEMA QUE ISTO RESOLVE, medido em produção: um mercado free enviou seu
-- acervo de ~3.600 notas na primeira instalação. As 1.000 primeiras entraram, o
-- limite mensal estourou e o resto foi recusado. Resultado: o sistema analisava
-- FEVEREIRO em julho — o recorte que sobrou era o começo do acervo, não a
-- operação atual. A loja parecia "sem dados" porque os dados eram velhos.
--
-- A regra nova separa duas coisas que o limite mensal tratava igual:
--
--   CARGA HISTÓRICA  o acervo que já existia na pasta do PDV antes de o agente
--                    ser instalado. Entra INTEGRALMENTE, sem consumir cota,
--                    porque é o que dá lastro à análise desde o primeiro dia —
--                    e porque não representa uso corrente do serviço.
--
--   OPERAÇÃO         nota emitida DEPOIS do primeiro envio daquele mercado.
--                    Essa consome a cota, que passa de mensal para semanal.
--
-- O corte é a data de emissão contra o marco do primeiro envio. É objetivo e
-- não se burla sem falsificar o XML — diferente de "janela de N dias após a
-- instalação", que premiaria quem segura notas novas para entrarem de graça.
--
-- Cota semanal e não mensal: 1.000/mês trava a loja pequena por três semanas
-- depois de uma semana boa. 1.000/semana dá ~4.300/mês para quem precisa e
-- devolve a capacidade toda segunda — a loja nunca fica muito tempo cega, que
-- era o efeito colateral pior do teto mensal.

-- ── 1. Marco do primeiro envio ─────────────────────────────────────────────
-- Gravado na primeira nota que o mercado ingere, e nunca mais alterado: é ele
-- que separa acervo de operação. Se pudesse ser reescrito, bastaria reinstalar
-- o agente para zerar a cota.
ALTER TABLE markets
    ADD COLUMN IF NOT EXISTS first_ingest_at TIMESTAMP,
    -- Data de emissão da nota mais antiga já recebida. Diagnóstico: mostra o
    -- tamanho real do acervo que a loja trouxe.
    ADD COLUMN IF NOT EXISTS oldest_invoice_date DATE;

COMMENT ON COLUMN markets.first_ingest_at IS
    'Instante do primeiro envio aceito. Notas emitidas ANTES disto são carga '
    'histórica e não consomem cota. Imutável depois de gravado.';

-- Backfill para os mercados que já operam.
--
-- O marco é AGORA, não a data da nota mais antiga. A distinção decide tudo:
-- o marco significa "quando o agente começou a enviar", não "quando a loja
-- começou a vender". Usar a emissão mais antiga classificaria como operação
-- todo o acervo intermediário — um mercado com XML desde 2023 veria as notas
-- de 2024 e 2025 consumindo cota, que é exatamente o defeito sendo corrigido.
--
-- Com o marco em NOW(), tudo que já existe e tudo que ainda vier do acervo
-- entra livre; só a venda daqui para a frente consome.
UPDATE markets m
SET first_ingest_at = NOW(),
    oldest_invoice_date = sub.primeira_emissao::date
FROM (
    SELECT market_id, MIN(data_emissao) AS primeira_emissao
    FROM invoices
    GROUP BY market_id
) sub
WHERE sub.market_id = m.id
  AND m.first_ingest_at IS NULL;

-- ── 2. Ciclo semanal no contador de uso ────────────────────────────────────
-- A coluna cycle_start passa a guardar a SEGUNDA-FEIRA da semana, em vez do
-- primeiro dia do mês. A unique (market_id, cycle_start) já existente continua
-- valendo e passa a significar "uma linha por semana".
ALTER TABLE market_usage_counters
    -- Separado de invoices_ingested: carga histórica não consome cota, mas
    -- precisa ser medida — é o número que mostra o tamanho do acervo trazido.
    ADD COLUMN IF NOT EXISTS historical_ingested INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN market_usage_counters.invoices_ingested IS
    'Notas de OPERAÇÃO na semana (emitidas após o primeiro envio). É o que '
    'consome a cota do plano.';
COMMENT ON COLUMN market_usage_counters.historical_ingested IS
    'Notas de carga histórica aceitas. Não consomem cota; medidas para '
    'diagnóstico do acervo.';
COMMENT ON COLUMN market_usage_counters.cycle_start IS
    'Segunda-feira da semana do ciclo. Era o dia 1 do mês até a V52.';

-- Os contadores antigos são mensais: o cycle_start deles é o dia 1, que quase
-- nunca cai numa segunda. Deixados como estão, virariam linhas órfãs num ciclo
-- que jamais se repete — e o mercado abriria a semana nova com a cota já
-- marcada como estourada, exatamente o problema que esta migration corrige.
--
-- Todas as notas já ingeridas são reclassificadas como carga histórica: elas
-- entraram antes desta regra existir, e cobrá-las agora puniria o cliente por
-- uma mudança nossa. A cota semanal começa zerada para todo mundo.
UPDATE market_usage_counters
SET historical_ingested = historical_ingested + invoices_ingested,
    invoices_ingested = 0,
    -- Zera o marco de estouro: ele se referia ao teto mensal que não existe
    -- mais. Sem isto, a UI seguiria anunciando "limite atingido" para sempre.
    limit_reached_at = NULL,
    -- E o contador de recusas, que estava inflado por reenvio (uma tentativa
    -- por incremento). A contagem correta passa a viver em invoice_rejections,
    -- onde uma nota é uma linha.
    invoices_rejected = 0
WHERE EXTRACT(ISODOW FROM cycle_start) <> 1;

-- ── 3. Recusas persistidas ─────────────────────────────────────────────────
-- Até aqui, uma nota recusada por cota sumia: o contador subia e o XML se
-- perdia. Como o agente reenvia, o mesmo arquivo era contado dezenas de vezes —
-- foi o que produziu "10.511 rejeitadas" sobre um acervo de ~2.600 notas, um
-- número que não descrevia nada.
--
-- Guardamos a CHAVE, nunca o XML: a chave identifica a nota para reprocessar,
-- sem trazer para o banco o conteúdo (CPF do consumidor, itens) de um documento
-- que o sistema recusou. Registrar o que não se aceitou seria acumular dado
-- pessoal sem contrapartida.
CREATE TABLE invoice_rejections (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id      UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,

    chave_nfe      VARCHAR(44) NOT NULL,
    data_emissao   TIMESTAMP,

    -- COTA_SEMANAL | OUTRO
    reason         VARCHAR(24) NOT NULL DEFAULT 'COTA_SEMANAL',

    -- Quantas vezes o agente tentou. Substitui o contador inflado: aqui uma
    -- nota é uma linha, por mais que seja reenviada.
    attempts       INTEGER NOT NULL DEFAULT 1,

    first_attempt_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_attempt_at  TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Preenchido quando a nota finalmente entra, em outra semana ou após
    -- upgrade. Permite responder "o que ficou de fora e já foi recuperado".
    resolved_at    TIMESTAMP,

    CONSTRAINT uq_invoice_rejection UNIQUE (market_id, chave_nfe)
);

CREATE INDEX idx_invoice_rejections_market
    ON invoice_rejections (market_id, resolved_at NULLS FIRST);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE invoice_rejections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON invoice_rejections;
CREATE POLICY tenant_isolation ON invoice_rejections FOR ALL USING (
    current_setting('app.is_admin', true) = 'true'
    OR market_id = NULLIF(current_setting('app.current_market', true), '')::uuid
);

DO $$
DECLARE
    app_role TEXT := 'mercadoflow_app';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_rejections TO %I', app_role);
    END IF;
END $$;
