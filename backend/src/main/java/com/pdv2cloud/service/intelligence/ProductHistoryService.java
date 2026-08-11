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
 * Evolução das métricas de um produto ao longo do tempo.
 *
 * Responde o que o sistema nunca soube responder: "o giro deste produto está
 * melhorando?". Antes do histórico, cada materialização apagava o retrato
 * anterior — havia sempre um "agora" e nenhum "antes".
 *
 * Também é a fundação de duas coisas planejadas: a calibração de scores pelo
 * feedback loop (que precisa comparar previsto com realizado ao longo de
 * semanas) e a divisão para fabricantes, que só tem valor mostrando evolução do
 * produto no mercado, não um retrato isolado.
 */
@Service
public class ProductHistoryService {

    /** Janela padrão da série exibida. */
    private static final int DEFAULT_DAYS = 90;

    /**
     * Mínimo de pontos para afirmar tendência.
     *
     * Com dois retratos, "melhorou" pode ser oscilação de um dia. Abaixo disso o
     * serviço devolve a série mas não classifica a direção.
     */
    private static final int MIN_POINTS_FOR_TREND = 5;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public ProductHistoryService(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Série histórica de um produto. */
    @Transactional(readOnly = true)
    public ProductEvolution evolution(UUID marketId, UUID productId, int days) {
        int window = days > 0 ? days : DEFAULT_DAYS;

        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("productId", productId)
            .addValue("since", LocalDate.now().minusDays(window));

        List<MetricPoint> points = new ArrayList<>();
        jdbcTemplate.query(
            "select snapshot_date, revenue, quantity_sold, daily_velocity, "
                + "       abc_class, xyz_class, capital_status, gmroi, coverage_days, "
                + "       momentum_score, priority_score, gross_margin_percent, unit_price "
                + "from product_metric_history "
                + "where market_id = :marketId and product_id = :productId "
                + "  and snapshot_date >= :since "
                + "order by snapshot_date asc",
            params,
            rs -> {
                points.add(new MetricPoint(
                    rs.getDate("snapshot_date").toLocalDate(),
                    rs.getBigDecimal("revenue"),
                    rs.getBigDecimal("quantity_sold"),
                    rs.getBigDecimal("daily_velocity"),
                    rs.getString("abc_class"),
                    rs.getString("xyz_class"),
                    rs.getString("capital_status"),
                    rs.getBigDecimal("gmroi"),
                    rs.getBigDecimal("coverage_days"),
                    rs.getBigDecimal("momentum_score"),
                    rs.getBigDecimal("priority_score"),
                    rs.getBigDecimal("gross_margin_percent"),
                    rs.getBigDecimal("unit_price")
                ));
            });

        return new ProductEvolution(
            productId, points, describeTrend(points), classChanges(points));
    }

    /**
     * Compara a primeira e a última metade da série.
     *
     * Comparar apenas o primeiro com o último ponto seria refém de dois dias
     * atípicos; a média de cada metade é mais estável e ainda sensível o
     * bastante para captar virada de tendência.
     */
    private String describeTrend(List<MetricPoint> points) {
        if (points.size() < MIN_POINTS_FOR_TREND) {
            return "Ainda não há histórico suficiente para dizer se o produto está melhorando ou "
                + "piorando. A série começa a ficar confiável depois de alguns dias de coleta.";
        }

        int half = points.size() / 2;
        double firstHalf = averageVelocity(points.subList(0, half));
        double secondHalf = averageVelocity(points.subList(half, points.size()));

        if (firstHalf <= 0) {
            return secondHalf > 0
                ? "O produto voltou a girar no período mais recente."
                : "O produto seguiu sem giro relevante em todo o período.";
        }

        double change = (secondHalf - firstHalf) / firstHalf * 100.0;
        if (change >= 15) {
            return String.format(
                "O giro está acelerando: subiu %.0f%% entre a primeira e a segunda metade do "
                    + "período (%.2f para %.2f un./dia).", change, firstHalf, secondHalf);
        }
        if (change <= -15) {
            return String.format(
                "O giro está desacelerando: caiu %.0f%% entre a primeira e a segunda metade do "
                    + "período (%.2f para %.2f un./dia). Vale entender o motivo antes de repor.",
                Math.abs(change), firstHalf, secondHalf);
        }
        return String.format(
            "O giro está estável em torno de %.2f un./dia, sem variação relevante no período.",
            secondHalf);
    }

    private double averageVelocity(List<MetricPoint> slice) {
        return slice.stream()
            .map(MetricPoint::dailyVelocity)
            .filter(v -> v != null)
            .mapToDouble(BigDecimal::doubleValue)
            .average()
            .orElse(0.0);
    }

    /**
     * Momentos em que o produto mudou de classe ou de veredito de capital.
     *
     * É a informação mais acionável da série: um item que saiu de A para B, ou
     * que virou LIQUIDAR, mudou de patamar — e a data em que isso aconteceu
     * ajuda a lembrar o que mudou na loja naquele momento.
     */
    private List<ClassChange> classChanges(List<MetricPoint> points) {
        List<ClassChange> changes = new ArrayList<>();
        for (int i = 1; i < points.size(); i++) {
            MetricPoint prev = points.get(i - 1);
            MetricPoint cur = points.get(i);

            if (differs(prev.abcClass(), cur.abcClass())) {
                changes.add(new ClassChange(cur.date(), "Classe ABC",
                    prev.abcClass(), cur.abcClass(),
                    String.format("Passou de classe %s para %s.", prev.abcClass(), cur.abcClass())));
            }
            if (differs(prev.capitalStatus(), cur.capitalStatus())) {
                changes.add(new ClassChange(cur.date(), "Veredito de capital",
                    prev.capitalStatus(), cur.capitalStatus(),
                    String.format("O veredito mudou de %s para %s.",
                        prev.capitalStatus(), cur.capitalStatus())));
            }
        }
        return changes;
    }

    private boolean differs(String a, String b) {
        return a != null && b != null && !a.equals(b);
    }

    /**
     * Evolução do portfólio: quantos produtos em cada veredito ao longo do
     * tempo. Mostra se o capital parado da loja está crescendo ou diminuindo.
     */
    @Transactional(readOnly = true)
    public List<PortfolioSnapshot> portfolioEvolution(UUID marketId, int days) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("since", LocalDate.now().minusDays(days > 0 ? days : DEFAULT_DAYS));

        List<PortfolioSnapshot> out = new ArrayList<>();
        jdbcTemplate.query(
            "select snapshot_date, "
                + "       count(*) as produtos, "
                + "       count(*) filter (where capital_status = 'INVEST') as investir, "
                + "       count(*) filter (where capital_status = 'MANTER') as manter, "
                + "       count(*) filter (where capital_status = 'REDUZIR') as reduzir, "
                + "       count(*) filter (where capital_status = 'LIQUIDAR') as liquidar, "
                + "       coalesce(sum(inventory_value), 0) as capital_total, "
                + "       coalesce(sum(inventory_value) filter "
                + "                (where capital_status in ('REDUZIR','LIQUIDAR')), 0) as capital_parado "
                + "from product_metric_history "
                + "where market_id = :marketId and snapshot_date >= :since "
                + "group by snapshot_date order by snapshot_date asc",
            params,
            rs -> {
                BigDecimal total = rs.getBigDecimal("capital_total");
                BigDecimal frozen = rs.getBigDecimal("capital_parado");
                BigDecimal frozenPct = total != null && total.signum() > 0
                    ? frozen.divide(total, 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

                out.add(new PortfolioSnapshot(
                    rs.getDate("snapshot_date").toLocalDate(),
                    rs.getInt("produtos"),
                    rs.getInt("investir"), rs.getInt("manter"),
                    rs.getInt("reduzir"), rs.getInt("liquidar"),
                    total, frozen, frozenPct));
            });
        return out;
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    public record MetricPoint(
        LocalDate date,
        BigDecimal revenue, BigDecimal quantitySold, BigDecimal dailyVelocity,
        String abcClass, String xyzClass, String capitalStatus,
        BigDecimal gmroi, BigDecimal coverageDays,
        BigDecimal momentumScore, BigDecimal priorityScore,
        BigDecimal grossMarginPercent, BigDecimal unitPrice
    ) {}

    public record ClassChange(
        LocalDate date, String dimension, String from, String to, String description
    ) {}

    public record ProductEvolution(
        UUID productId,
        List<MetricPoint> series,
        String trend,
        List<ClassChange> changes
    ) {}

    public record PortfolioSnapshot(
        LocalDate date, int products,
        int invest, int manter, int reduzir, int liquidar,
        BigDecimal totalCapital, BigDecimal frozenCapital, BigDecimal frozenPercent
    ) {}
}
