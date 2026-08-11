package com.pdv2cloud.service.intelligence;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decide em que período a análise deve olhar, para cada loja.
 *
 * PROBLEMA QUE RESOLVE: todas as janelas do sistema (90 dias do capital, 180 do
 * halo, 365 da sazonalidade) eram contadas a partir de HOJE. Isso quebra em dois
 * cenários reais:
 *
 *  1. PRIMEIRA INSTALAÇÃO. O agente encontra meses de XMLs na pasta do PDV e
 *     envia tudo. Se o acervo termina há quatro meses, uma janela de 90 dias a
 *     partir de hoje não alcança venda nenhuma — o cliente novo abre a Central e
 *     vê capital zerado, giro zerado, nenhuma oportunidade. A impressão é de que
 *     o produto não funciona, justamente no primeiro contato.
 *
 *  2. LOJA QUE PAROU DE ENVIAR. Agente desligado, PDV trocado, problema de rede.
 *     O sistema deveria dizer "seus dados param em maio", não fingir que a loja
 *     não vende nada.
 *
 * A SOLUÇÃO: ancorar a janela na venda mais recente CONHECIDA, não na data de
 * hoje — e deixar explícito quando a análise é histórica, para que ninguém tome
 * decisão de compra hoje com número de três meses atrás achando que é atual.
 */
@Service
@Slf4j
public class SalesWindowResolver {

    /**
     * Defasagem tolerada antes de considerar os dados históricos.
     *
     * Dois dias cobrem fim de semana e feriado sem alarme falso; acima disso é
     * sinal de que ou o acervo é antigo, ou a coleta parou.
     */
    private static final int FRESH_DATA_TOLERANCE_DAYS = 2;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public SalesWindowResolver(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Cobertura de dados de vendas de um mercado.
     *
     * @param anchorDate   data em que as janelas de análise devem terminar
     * @param historical   true quando a última venda é antiga o bastante para a
     *                     análise não representar o momento atual da loja
     * @param daysBehind   quantos dias os dados estão atrasados
     */
    public record SalesCoverage(
        LocalDate oldestSale,
        LocalDate latestSale,
        LocalDate anchorDate,
        long totalInvoices,
        long spanDays,
        boolean historical,
        long daysBehind,
        String notice
    ) {
        public boolean hasData() {
            return totalInvoices > 0 && latestSale != null;
        }
    }

    /**
     * Resolve a cobertura e o ponto de ancoragem da análise.
     *
     * Sem venda alguma, devolve cobertura vazia — o chamador deve exibir "ainda
     * não há dados" em vez de zeros, que o usuário leria como "vendi nada".
     */
    @Transactional(readOnly = true)
    public SalesCoverage resolve(UUID marketId) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId);

        final LocalDate[] dates = { null, null };
        final long[] total = { 0 };

        jdbcTemplate.query(
            "select min(data_emissao)::date as oldest, "
                + "       max(data_emissao)::date as latest, "
                + "       count(*) as total "
                + "from invoices where market_id = :marketId",
            params,
            rs -> {
                if (rs.getDate("oldest") != null) {
                    dates[0] = rs.getDate("oldest").toLocalDate();
                }
                if (rs.getDate("latest") != null) {
                    dates[1] = rs.getDate("latest").toLocalDate();
                }
                total[0] = rs.getLong("total");
            });

        LocalDate oldest = dates[0];
        LocalDate latest = dates[1];

        if (latest == null || total[0] == 0) {
            return new SalesCoverage(
                null, null, LocalDate.now(), 0, 0, false, 0,
                "Ainda não recebemos notas desta loja. Assim que o agente enviar as primeiras "
                    + "vendas, a análise começa a aparecer aqui.");
        }

        LocalDate today = LocalDate.now();
        long daysBehind = ChronoUnit.DAYS.between(latest, today);
        boolean historical = daysBehind > FRESH_DATA_TOLERANCE_DAYS;

        // A âncora é a última venda quando os dados são antigos: analisar 90
        // dias a partir de hoje sobre um acervo que terminou em fevereiro não
        // encontraria venda nenhuma.
        LocalDate anchor = historical ? latest : today;
        long span = oldest != null ? ChronoUnit.DAYS.between(oldest, latest) + 1 : 0;

        return new SalesCoverage(
            oldest, latest, anchor, total[0], span, historical, daysBehind,
            buildNotice(historical, daysBehind, oldest, latest, total[0]));
    }

    /**
     * Aviso em linguagem do lojista.
     *
     * Distingue as duas causas de dado antigo, porque a ação é diferente: acervo
     * histórico recém-importado é normal e se resolve sozinho; coleta parada
     * exige que alguém vá olhar o agente.
     */
    private String buildNotice(
        boolean historical, long daysBehind, LocalDate oldest, LocalDate latest, long total
    ) {
        if (!historical) {
            return null;
        }
        if (daysBehind > 30) {
            return String.format(
                "Atenção: a venda mais recente que recebemos é de %s, há %d dias. A análise abaixo "
                    + "reflete esse período, não o momento atual da loja. Verifique se o agente "
                    + "continua enviando as notas do PDV.",
                latest, daysBehind);
        }
        return String.format(
            "Analisando o período de %s a %s (%d notas). A venda mais recente recebida é de %d "
                + "dias atrás.",
            oldest, latest, total, daysBehind);
    }

    /**
     * Início da janela, respeitando a âncora.
     *
     * Use no lugar de {@code LocalDate.now().minusDays(n)} em qualquer análise
     * que precise funcionar com acervo histórico.
     */
    public LocalDate windowStart(SalesCoverage coverage, int windowDays) {
        return coverage.anchorDate().minusDays(windowDays);
    }

    /**
     * Registra a cobertura no estado do mercado.
     *
     * Serve ao diagnóstico ("por que essa loja não gera oportunidade?") e à
     * detecção de carga inicial pelo refresh adaptativo.
     */
    @Transactional
    public void recordCoverage(UUID marketId, SalesCoverage coverage) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("oldest", coverage.oldestSale())
            .addValue("latest", coverage.latestSale())
            .addValue("total", (int) Math.min(Integer.MAX_VALUE, coverage.totalInvoices()));

        jdbcTemplate.update(
            "insert into market_refresh_state (market_id, oldest_sale_date, latest_sale_date, "
                + "                            total_invoices, updated_at) "
                + "values (:marketId, :oldest, :latest, :total, now()) "
                + "on conflict (market_id) do update set "
                + "  oldest_sale_date = excluded.oldest_sale_date, "
                + "  latest_sale_date = excluded.latest_sale_date, "
                + "  total_invoices = excluded.total_invoices, "
                + "  updated_at = now()",
            params);
    }
}
