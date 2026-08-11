package com.pdv2cloud.service.intelligence;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Detecção de anomalia na venda diária da loja por EWMA.
 *
 * Responde a uma pergunta que nenhum dos 8 detectores existentes cobria: "hoje
 * foi um dia fora da curva?". Os alertas atuais olham produto a produto; este
 * olha o faturamento da loja como série temporal.
 *
 * POR QUE EWMA E NÃO MÉDIA SIMPLES: a média móvel trata o movimento de 30 dias
 * atrás com o mesmo peso do de ontem. Num varejo que cresce, isso gera alarme
 * falso todo dia — a média sempre fica para trás e todo dia "supera a média".
 * A média exponencial acompanha o nível recente, então só dispara quando o dia
 * escapa do que a própria loja vinha fazendo.
 *
 * O desvio também é exponencial (EWMSD), pelo mesmo motivo: uma loja que vende
 * de forma irregular tem faixa naturalmente larga e não deve gerar alerta a cada
 * sábado movimentado.
 */
@Service
public class SalesAnomalyDetector {

    /**
     * Fator de suavização: peso do dia mais recente.
     *
     * 0,2 equivale a uma janela efetiva de ~9 dias — reage a mudança de patamar
     * sem perseguir o ruído diário.
     */
    private static final double ALPHA = 0.2;

    /** Quantos desvios-padrão definem a faixa normal. */
    private static final double SIGMA_THRESHOLD = 2.5;

    /** Dias de histórico exigidos antes de julgar qualquer dia. */
    private static final int MIN_HISTORY_DAYS = 21;

    /** Janela analisada. */
    private static final int WINDOW_DAYS = 90;

    /** Dias recentes em que se procura anomalia (o resto serve de base). */
    private static final int RECENT_DAYS = 7;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public SalesAnomalyDetector(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Anomalias de venda nos últimos dias.
     *
     * @return lista vazia quando não há histórico suficiente — uma loja com duas
     *         semanas de dados não tem padrão do qual desviar
     */
    @Transactional(readOnly = true)
    public List<SalesAnomaly> detect(UUID marketId) {
        List<DailySales> series = loadDailySales(marketId);
        if (series.size() < MIN_HISTORY_DAYS) {
            return List.of();
        }

        List<SalesAnomaly> anomalies = new ArrayList<>();

        // EWMA e EWMSD são construídos incrementalmente: cada dia é julgado
        // contra o padrão formado pelos dias ANTERIORES a ele, nunca contra uma
        // média que já inclui o próprio dia (o que mascararia o desvio).
        double ewma = series.get(0).revenue();
        double ewmVariance = 0.0;

        LocalDate recentFrom = LocalDate.now().minusDays(RECENT_DAYS);

        for (int i = 1; i < series.size(); i++) {
            DailySales day = series.get(i);
            double deviation = day.revenue() - ewma;
            double stdDev = Math.sqrt(ewmVariance);

            boolean hasBaseline = i >= MIN_HISTORY_DAYS;
            boolean isRecent = !day.date().isBefore(recentFrom);

            if (hasBaseline && isRecent && stdDev > 0) {
                double zScore = deviation / stdDev;
                if (Math.abs(zScore) >= SIGMA_THRESHOLD) {
                    anomalies.add(buildAnomaly(day, ewma, stdDev, zScore));
                }
            }

            // Atualiza o padrão DEPOIS de julgar o dia.
            ewmVariance = (1 - ALPHA) * (ewmVariance + ALPHA * deviation * deviation);
            ewma = ALPHA * day.revenue() + (1 - ALPHA) * ewma;
        }

        return anomalies;
    }

    private SalesAnomaly buildAnomaly(DailySales day, double expected, double stdDev, double zScore) {
        boolean above = zScore > 0;
        double deviationPercent = expected > 0
            ? (day.revenue() - expected) / expected * 100.0
            : 0.0;

        String description = above
            ? String.format(
                "Venda de %s ficou %.0f%% acima do esperado (R$ %.2f contra R$ %.2f previstos). "
                    + "Vale entender o que puxou o movimento para repetir.",
                day.date(), Math.abs(deviationPercent), day.revenue(), expected)
            : String.format(
                "Venda de %s ficou %.0f%% abaixo do esperado (R$ %.2f contra R$ %.2f previstos). "
                    + "Verifique se houve problema de operação, ruptura ou fechamento.",
                day.date(), Math.abs(deviationPercent), day.revenue(), expected);

        return new SalesAnomaly(
            day.date(),
            BigDecimal.valueOf(day.revenue()).setScale(2, RoundingMode.HALF_UP),
            BigDecimal.valueOf(expected).setScale(2, RoundingMode.HALF_UP),
            BigDecimal.valueOf(stdDev).setScale(2, RoundingMode.HALF_UP),
            BigDecimal.valueOf(zScore).setScale(2, RoundingMode.HALF_UP),
            BigDecimal.valueOf(deviationPercent).setScale(2, RoundingMode.HALF_UP),
            above ? "ACIMA" : "ABAIXO",
            day.transactions(),
            description
        );
    }

    private List<DailySales> loadDailySales(UUID marketId) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("since", LocalDate.now().minusDays(WINDOW_DAYS).atStartOfDay());

        List<DailySales> out = new ArrayList<>();
        jdbcTemplate.query(
            "select cast(i.data_emissao as date) as sale_date, " +
            "       coalesce(sum(i.valor_total), 0) as revenue, " +
            "       count(*) as transactions " +
            "from invoices i " +
            "where i.market_id = :marketId and i.data_emissao >= :since " +
            "group by cast(i.data_emissao as date) " +
            "order by sale_date asc",
            params,
            rs -> {
                out.add(new DailySales(
                    rs.getDate("sale_date").toLocalDate(),
                    rs.getDouble("revenue"),
                    rs.getLong("transactions")
                ));
            });
        return out;
    }

    private record DailySales(LocalDate date, double revenue, long transactions) {
    }

    public record SalesAnomaly(
        LocalDate date,
        BigDecimal actualRevenue,
        BigDecimal expectedRevenue,
        BigDecimal standardDeviation,
        BigDecimal zScore,
        BigDecimal deviationPercent,
        String direction,
        long transactions,
        String description
    ) {}
}
