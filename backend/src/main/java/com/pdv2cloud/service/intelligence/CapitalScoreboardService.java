package com.pdv2cloud.service.intelligence;

import com.pdv2cloud.model.entity.ProductCapitalMetric.CapitalStatus;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import com.pdv2cloud.util.StaleWhileRevalidateCache;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.time.Duration;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * "Seu dinheiro na loja" (F2 do plano de experiência, 07/10/2026): o placar do
 * capital de giro, que era a promessa central e não aparecia em tela nenhuma.
 *
 * Tudo sai do cálculo de capital por produto (materializado à noite) e cada
 * número diz se é MEDIDO ou ESTIMADO:
 *  - estoque em reais: só produtos com estoque conhecido (confiança ≥ 0,3);
 *    "medido" quando cobre ≥ 70% do faturamento;
 *  - dias de estoque: estoque em reais ÷ custo do que se vende por dia;
 *  - margem de 30 dias: "medida" quando ≥ 70% do faturamento tem custo real;
 *  - dinheiro parado: estoque dos produtos com veredito liquidar ou comprar menos.
 * Uma foto por dia vai para store_capital_daily, para mostrar a evolução.
 */
@Service
public class CapitalScoreboardService {

    static final int WINDOW_DAYS = 90;
    static final double MIN_STOCK_CONFIDENCE = 0.30;
    static final double MEASURED_SHARE = 0.70;

    private final CapitalMetricsReader capital;
    private final NamedParameterJdbcTemplate jdbc;
    private final StaleWhileRevalidateCache<Map<String, Object>> cache =
        new StaleWhileRevalidateCache<>(Duration.ofMinutes(10));

    public CapitalScoreboardService(CapitalMetricsReader capital, NamedParameterJdbcTemplate jdbc) {
        this.capital = capital;
        this.jdbc = jdbc;
    }

    public record Score(BigDecimal stockValue, double stockMeasuredShare, BigDecimal daysOfStock,
                        BigDecimal revenue30, BigDecimal margin30, BigDecimal marginPercent, double marginMeasuredShare,
                        BigDecimal idleValue, int idleProducts) { }

    /** Soma por loja (público no pacote para os testes). */
    static Score compute(List<CapitalMetric> portfolio, int windowDays) {
        BigDecimal revenue = BigDecimal.ZERO;
        BigDecimal margin = BigDecimal.ZERO;
        BigDecimal revenueWithRealCost = BigDecimal.ZERO;
        BigDecimal stock = BigDecimal.ZERO;
        BigDecimal revenueWithStock = BigDecimal.ZERO;
        BigDecimal cogsOfStocked = BigDecimal.ZERO;
        BigDecimal idle = BigDecimal.ZERO;
        int idleCount = 0;
        for (CapitalMetric m : portfolio) {
            BigDecimal rev = nz(m.revenue());
            BigDecimal mg = nz(m.grossMarginValue());
            revenue = revenue.add(rev);
            margin = margin.add(mg);
            if (!"MARGIN_ESTIMATE".equals(m.costSource())) revenueWithRealCost = revenueWithRealCost.add(rev);
            boolean known = m.inventoryValue() != null && m.inventoryConfidence() != null
                && m.inventoryConfidence().doubleValue() >= MIN_STOCK_CONFIDENCE;
            if (known) {
                stock = stock.add(m.inventoryValue());
                revenueWithStock = revenueWithStock.add(rev);
                cogsOfStocked = cogsOfStocked.add(rev.subtract(mg));
                if (m.capitalStatus() == CapitalStatus.LIQUIDAR || m.capitalStatus() == CapitalStatus.REDUZIR) {
                    idle = idle.add(m.inventoryValue());
                    idleCount++;
                }
            }
        }
        BigDecimal per30 = BigDecimal.valueOf(30.0 / Math.max(1, windowDays));
        BigDecimal cogsPerDay = cogsOfStocked.divide(BigDecimal.valueOf(Math.max(1, windowDays)), 6, RoundingMode.HALF_UP);
        BigDecimal days = stock.signum() > 0 && cogsPerDay.signum() > 0
            ? stock.divide(cogsPerDay, 1, RoundingMode.HALF_UP) : null;
        return new Score(
            stock.signum() > 0 ? stock.setScale(2, RoundingMode.HALF_UP) : null,
            share(revenueWithStock, revenue),
            days,
            revenue.multiply(per30).setScale(2, RoundingMode.HALF_UP),
            margin.multiply(per30).setScale(2, RoundingMode.HALF_UP),
            revenue.signum() > 0 ? margin.multiply(BigDecimal.valueOf(100)).divide(revenue, 2, RoundingMode.HALF_UP) : null,
            share(revenueWithRealCost, revenue),
            idle.setScale(2, RoundingMode.HALF_UP),
            idleCount);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static double share(BigDecimal part, BigDecimal total) {
        return total.signum() == 0 ? 0 : part.divide(total, 4, RoundingMode.HALF_UP).doubleValue();
    }

    /** Placar de hoje, com a evolução desde a primeira foto. Grava a foto do dia. */
    public Map<String, Object> scoreboard(UUID marketId) {
        return cache.get(marketId, () -> build(marketId));
    }

    public void snapshot(UUID marketId) {
        cache.invalidate(marketId);
        build(marketId);
    }

    private Map<String, Object> build(UUID marketId) {
        Score s = compute(capital.portfolio(marketId, WINDOW_DAYS), WINDOW_DAYS);
        save(marketId, s);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stockValue", s.stockValue());
        out.put("stockMeasured", s.stockMeasuredShare() >= MEASURED_SHARE);
        out.put("stockMeasuredShare", s.stockMeasuredShare());
        out.put("daysOfStock", s.daysOfStock());
        out.put("revenue30", s.revenue30());
        out.put("margin30", s.margin30());
        out.put("marginPercent", s.marginPercent());
        out.put("marginMeasured", s.marginMeasuredShare() >= MEASURED_SHARE);
        out.put("marginMeasuredShare", s.marginMeasuredShare());
        out.put("idleValue", s.idleValue());
        out.put("idleProducts", s.idleProducts());
        List<Map<String, Object>> history = jdbc.queryForList(
            "select day, stock_value as \"stockValue\", days_of_stock as \"daysOfStock\", idle_value as \"idleValue\", "
                + "margin_percent as \"marginPercent\", margin_30d as \"margin30\" from store_capital_daily "
                + "where market_id = :m and day > current_date - 120 order by day",
            new MapSqlParameterSource("m", marketId));
        out.put("history", history);
        out.put("since", history.isEmpty() ? null : history.get(0).get("day"));
        out.put("baseline", history.isEmpty() ? null : history.get(0));
        return out;
    }

    private void save(UUID marketId, Score s) {
        jdbc.update("insert into store_capital_daily (market_id, day, stock_value, stock_measured_share, days_of_stock, revenue_30d, "
                + "margin_30d, margin_percent, margin_measured_share, idle_value, idle_products) "
                + "values (:m, :d, :sv, :sms, :ds, :r, :mg, :mp, :mms, :iv, :ip) "
                + "on conflict (market_id, day) do update set stock_value = excluded.stock_value, "
                + "stock_measured_share = excluded.stock_measured_share, days_of_stock = excluded.days_of_stock, "
                + "revenue_30d = excluded.revenue_30d, margin_30d = excluded.margin_30d, margin_percent = excluded.margin_percent, "
                + "margin_measured_share = excluded.margin_measured_share, idle_value = excluded.idle_value, "
                + "idle_products = excluded.idle_products, computed_at = now() "
                + "where (store_capital_daily.stock_value, store_capital_daily.days_of_stock, store_capital_daily.margin_30d, "
                + "store_capital_daily.idle_value) is distinct from (excluded.stock_value, excluded.days_of_stock, "
                + "excluded.margin_30d, excluded.idle_value)",
            new MapSqlParameterSource("m", marketId).addValue("d", Date.valueOf(LocalDate.now()))
                .addValue("sv", s.stockValue()).addValue("sms", s.stockMeasuredShare()).addValue("ds", s.daysOfStock())
                .addValue("r", s.revenue30()).addValue("mg", s.margin30()).addValue("mp", s.marginPercent())
                .addValue("mms", s.marginMeasuredShare()).addValue("iv", s.idleValue()).addValue("ip", s.idleProducts()));
    }
}
