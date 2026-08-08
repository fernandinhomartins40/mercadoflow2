package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.ProductPromoEffectivenessDTO;
import com.pdv2cloud.model.dto.ProductPromoEffectivenessDTO.PromoWindowSummary;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Analisa a efetividade de promoções por produto com base nas notas fiscais.
 *
 * Metodologia:
 *  - Baseline: média móvel de 30 dias de preço para separar dias "promo" de "normal"
 *  - Threshold: venda abaixo de 95% do baseline = dia em promoção
 *  - Lifts de quantidade e receita: velocidade diária promo vs. normal
 *  - Elasticidade: Δqty% / Δprice%
 *  - Score: 0-100 combinando qty lift (40pts), revenue lift (40pts), consistência (20pts)
 */
@Service
public class PromoEffectivenessService {

    private static final double PROMO_THRESHOLD_RATIO = 0.95; // <95% do baseline = promo
    private static final int MIN_PROMO_DAYS = 5;              // mínimo para análise válida
    private static final int MIN_NORMAL_DAYS = 10;
    private static final int ANALYSIS_WINDOW_DAYS = 180;      // 6 meses

    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    // ── Public API ────────────────────────────────────────────────────────────

    public List<ProductPromoEffectivenessDTO> analyzeMarket(UUID marketId, int windowDays) {
        int days = windowDays > 0 ? Math.min(windowDays, 365) : ANALYSIS_WINDOW_DAYS;
        LocalDate since = LocalDate.now().minusDays(days);
        List<UUID> productIds = loadProductsWithPromo(marketId, since);
        List<ProductPromoEffectivenessDTO> results = new ArrayList<>();
        for (UUID pid : productIds) {
            ProductPromoEffectivenessDTO dto = computeForProduct(marketId, pid, since);
            if (dto != null) results.add(dto);
        }
        results.sort(Comparator.comparingInt(ProductPromoEffectivenessDTO::getEffectivenessScore).reversed());
        return results;
    }

    public ProductPromoEffectivenessDTO analyzeProduct(UUID marketId, UUID productId, int windowDays) {
        int days = windowDays > 0 ? Math.min(windowDays, 365) : ANALYSIS_WINDOW_DAYS;
        LocalDate since = LocalDate.now().minusDays(days);
        return computeForProduct(marketId, productId, since);
    }

    // ── Core computation ─────────────────────────────────────────────────────

    /**
     * Produtos que valem a análise: precisam ter dias suficientes com venda e
     * alguma variação real de preço no período.
     *
     * O filtro por variação evita rodar a análise completa (várias consultas por
     * produto) sobre itens de preço estável, que nunca entraram em promoção e
     * jamais produziriam resultado conclusivo.
     */
    private List<UUID> loadProductsWithPromo(UUID marketId, LocalDate since) {
        String sql =
            "with daily as ( " +
            "  select it.product_id, " +
            "         cast(i.data_emissao as date) as sale_date, " +
            "         sum(it.valor_total) / nullif(sum(it.quantidade), 0) as day_avg_price " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :marketId " +
            "    and i.data_emissao >= :since " +
            "    and it.product_id is not null " +
            "    and it.valor_unitario > 0 " +
            "  group by it.product_id, cast(i.data_emissao as date) " +
            ") " +
            "select product_id " +
            "from daily " +
            "where day_avg_price is not null " +
            "group by product_id " +
            "having count(*) >= :minDays " +
            // Só interessa quem teve alguma queda relevante frente à mediana.
            "   and min(day_avg_price) < percentile_cont(0.5) within group (order by day_avg_price) * :threshold " +
            "order by product_id";
        return jdbcTemplate.queryForList(sql,
            new MapSqlParameterSource("marketId", marketId)
                .addValue("since", since.atStartOfDay())
                .addValue("minDays", MIN_PROMO_DAYS + MIN_NORMAL_DAYS)
                .addValue("threshold", PROMO_THRESHOLD_RATIO),
            UUID.class);
    }

    private ProductPromoEffectivenessDTO computeForProduct(UUID marketId, UUID productId, LocalDate since) {
        // Step 1: Baseline price (average over first 30 days of window or full window if shorter)
        Double baseline = loadBaseline(marketId, productId, since);
        if (baseline == null || baseline <= 0) return null;

        // Step 2: Load daily aggregates split into promo/normal based on threshold
        DailyMetrics metrics = loadDailyMetrics(marketId, productId, since, baseline);
        if (metrics == null) return null;

        // Step 3: Load product metadata
        String[] meta = loadProductMeta(marketId, productId);
        if (meta == null) return null;

        // Step 4: Check data sufficiency
        if (metrics.promoDays < MIN_PROMO_DAYS || metrics.normalDays < MIN_NORMAL_DAYS) {
            return insufficientData(productId, meta, baseline, metrics);
        }

        // Step 5: Compute lifts
        double normalDailyQty = metrics.totalNormalQty / metrics.normalDays;
        double normalDailyRev = metrics.totalNormalRevenue / metrics.normalDays;
        double promoDailyQty  = metrics.totalPromoQty / metrics.promoDays;
        double promoDailyRev  = metrics.totalPromoRevenue / metrics.promoDays;

        double qtyLift = normalDailyQty > 0 ? (promoDailyQty / normalDailyQty - 1.0) * 100 : 0;
        double revLift = normalDailyRev > 0 ? (promoDailyRev / normalDailyRev - 1.0) * 100 : 0;

        // Step 6: Price elasticity  Δqty% / Δprice%
        double avgPromoPrice = metrics.totalPromoRevenue > 0 && metrics.totalPromoQty > 0
            ? metrics.totalPromoRevenue / metrics.totalPromoQty : baseline;
        double discountPct = baseline > 0 ? (avgPromoPrice - baseline) / baseline * 100 : 0; // negative
        double elasticity = discountPct != 0 ? qtyLift / discountPct : 0;

        // Step 7: Classify
        String classification = classify(qtyLift, revLift, metrics.promoDays);
        String label = classificationLabel(classification);
        String insight = buildInsight(classification, qtyLift, revLift, discountPct, elasticity, metrics.promoWindowCount);

        // Step 8: Score
        int score = computeScore(qtyLift, revLift, metrics.promoWindowCount, metrics.promoDays, metrics.totalPromoQty, metrics.totalNormalQty);

        // Step 9: Promo windows from ProductPromotionWindow entity
        List<PromoWindowSummary> windows = loadPromoWindows(marketId, productId, since, normalDailyRev, normalDailyQty);

        return new ProductPromoEffectivenessDTO(
            productId,
            meta[0], meta[1], meta[2],
            bd(baseline, 2),
            bd(avgPromoPrice, 2),
            bd(-discountPct, 2),           // positive = discount magnitude
            bd(normalDailyQty, 3),
            bd(promoDailyQty, 3),
            bd(normalDailyRev, 2),
            bd(promoDailyRev, 2),
            bd(qtyLift, 2),
            bd(revLift, 2),
            bd(elasticity, 4),
            bd(metrics.totalPromoRevenue, 2),
            bd(metrics.totalNormalRevenue, 2),
            bd(metrics.totalPromoQty, 3),
            bd(metrics.totalNormalQty, 3),
            metrics.promoDays,
            metrics.normalDays,
            metrics.promoWindowCount,
            score,
            classification,
            label,
            insight,
            windows
        );
    }

    /**
     * Preço "normal" de referência do produto na janela analisada.
     *
     * Usa a MEDIANA do preço médio diário, não a média, por duas razões:
     *  1. a média é puxada para baixo pelos próprios dias de promoção, o que
     *     encolhe o desconto aparente e chega a esconder promoções inteiras em
     *     produtos promocionados com frequência;
     *  2. a mediana ignora outliers de dias com pouquíssimo volume.
     *
     * Refina em duas passadas: calcula a mediana bruta, descarta os dias abaixo
     * do limiar de promoção e recalcula sobre os dias restantes. O resultado é o
     * preço de prateleira fora de promoção — que é a base correta para medir
     * profundidade de desconto e lift.
     */
    private Double loadBaseline(UUID marketId, UUID productId, LocalDate since) {
        Double rawMedian = medianDailyPrice(marketId, productId, since, null);
        if (rawMedian == null || rawMedian <= 0) {
            return rawMedian;
        }

        // Segunda passada: mediana apenas dos dias que não parecem promoção.
        Double refined = medianDailyPrice(marketId, productId, since, rawMedian * PROMO_THRESHOLD_RATIO);
        if (refined == null || refined <= 0) {
            return rawMedian;
        }
        return refined;
    }

    /**
     * Mediana do preço médio ponderado por dia. Quando {@code minPrice} é
     * informado, considera apenas os dias com preço igual ou acima dele.
     */
    private Double medianDailyPrice(UUID marketId, UUID productId, LocalDate since, Double minPrice) {
        String sql =
            "with daily as ( " +
            "  select cast(i.data_emissao as date) as sale_date, " +
            "         sum(it.valor_total) / nullif(sum(it.quantidade), 0) as day_avg_price " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :marketId " +
            "    and it.product_id = :productId " +
            "    and i.data_emissao >= :since " +
            "    and it.valor_unitario > 0 " +
            "  group by cast(i.data_emissao as date) " +
            ") " +
            "select percentile_cont(0.5) within group (order by day_avg_price) as baseline " +
            "from daily " +
            "where day_avg_price is not null " +
            (minPrice != null ? "  and day_avg_price >= :minPrice " : "");

        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("productId", productId)
            .addValue("since", since.atStartOfDay());
        if (minPrice != null) {
            params.addValue("minPrice", minPrice);
        }

        return jdbcTemplate.queryForObject(sql, params, Double.class);
    }

    private record DailyMetrics(
        double totalPromoRevenue, double totalNormalRevenue,
        double totalPromoQty, double totalNormalQty,
        int promoDays, int normalDays, int promoWindowCount
    ) {}

    private DailyMetrics loadDailyMetrics(UUID marketId, UUID productId, LocalDate since, double baseline) {
        double threshold = baseline * PROMO_THRESHOLD_RATIO;
        /*
         * Para cada dia, calcula preço médio ponderado pelo volume.
         * Se preço médio do dia < threshold → dia de promoção.
         * Isso evita classificar o dia inteiro como promo por causa de 1 item.
         */
        String sql =
            "with daily as ( " +
            "  select cast(i.data_emissao as date) as sale_date, " +
            "         sum(it.valor_total) as day_revenue, " +
            "         sum(it.quantidade) as day_qty, " +
            "         sum(it.valor_total) / nullif(sum(it.quantidade), 0) as day_avg_price " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :marketId " +
            "    and it.product_id = :productId " +
            "    and i.data_emissao >= :since " +
            "    and it.valor_unitario > 0 " +
            "  group by cast(i.data_emissao as date) " +
            ") " +
            "select " +
            "  coalesce(sum(case when day_avg_price < :threshold then day_revenue else 0 end), 0) as promo_revenue, " +
            "  coalesce(sum(case when day_avg_price >= :threshold then day_revenue else 0 end), 0) as normal_revenue, " +
            "  coalesce(sum(case when day_avg_price < :threshold then day_qty else 0 end), 0) as promo_qty, " +
            "  coalesce(sum(case when day_avg_price >= :threshold then day_qty else 0 end), 0) as normal_qty, " +
            "  count(case when day_avg_price < :threshold then 1 end) as promo_days, " +
            "  count(case when day_avg_price >= :threshold then 1 end) as normal_days " +
            "from daily";

        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("productId", productId)
            .addValue("since", since.atStartOfDay())
            .addValue("threshold", threshold);

        DailyMetrics[] result = {null};
        jdbcTemplate.query(sql, params, rs -> {
            result[0] = new DailyMetrics(
                rs.getDouble("promo_revenue"),
                rs.getDouble("normal_revenue"),
                rs.getDouble("promo_qty"),
                rs.getDouble("normal_qty"),
                rs.getInt("promo_days"),
                rs.getInt("normal_days"),
                0 // windows counted separately
            );
        });
        if (result[0] == null) return null;

        // Count distinct promo windows (consecutive promo days = 1 window)
        int windowCount = countPromoWindows(marketId, productId, since, threshold);
        return new DailyMetrics(
            result[0].totalPromoRevenue(), result[0].totalNormalRevenue(),
            result[0].totalPromoQty(), result[0].totalNormalQty(),
            result[0].promoDays(), result[0].normalDays(), windowCount
        );
    }

    private int countPromoWindows(UUID marketId, UUID productId, LocalDate since, double threshold) {
        // Count "groups" of consecutive promo days using lag window function
        String sql =
            "with daily_flags as ( " +
            "  select cast(i.data_emissao as date) as sale_date, " +
            "         case when sum(it.valor_total) / nullif(sum(it.quantidade), 0) < :threshold then 1 else 0 end as is_promo " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :marketId and it.product_id = :productId and i.data_emissao >= :since " +
            "    and it.valor_unitario > 0 " +
            "  group by cast(i.data_emissao as date) " +
            "), " +
            "with_prev as ( " +
            "  select sale_date, is_promo, " +
            "         lag(is_promo, 1, 0) over (order by sale_date) as prev_is_promo " +
            "  from daily_flags " +
            ") " +
            "select count(*) as window_count " +
            "from with_prev " +
            "where is_promo = 1 and prev_is_promo = 0";
        Integer count = jdbcTemplate.queryForObject(sql,
            new MapSqlParameterSource("marketId", marketId)
                .addValue("productId", productId)
                .addValue("since", since.atStartOfDay())
                .addValue("threshold", threshold),
            Integer.class);
        return count != null ? count : 0;
    }

    private List<PromoWindowSummary> loadPromoWindows(
        UUID marketId, UUID productId, LocalDate since,
        double normalDailyRev, double normalDailyQty
    ) {
        // Load from product_promotion_windows (already detected by PriceIntelligenceService)
        String sql =
            "select pw.start_at, pw.end_at, pw.discount_percent, pw.quantity_lift_percent, pw.revenue_lift_percent, " +
            "       coalesce(sum(it.valor_total), 0) as promo_revenue " +
            "from product_promotion_windows pw " +
            "left join invoices i on i.market_id = pw.market_id " +
            "left join invoice_items it on it.invoice_id = i.id and it.product_id = pw.product_id " +
            "   and i.data_emissao >= pw.start_at and (pw.end_at is null or i.data_emissao <= pw.end_at) " +
            "where pw.market_id = :marketId and pw.product_id = :productId and pw.start_at >= :since " +
            "group by pw.id, pw.start_at, pw.end_at, pw.discount_percent, pw.quantity_lift_percent, pw.revenue_lift_percent " +
            "order by pw.start_at desc " +
            "limit 20";

        List<PromoWindowSummary> windows = new ArrayList<>();
        jdbcTemplate.query(sql,
            new MapSqlParameterSource("marketId", marketId)
                .addValue("productId", productId)
                .addValue("since", since.atStartOfDay()),
            rs -> {
                java.time.LocalDateTime startAt = rs.getTimestamp("start_at") != null ? rs.getTimestamp("start_at").toLocalDateTime() : null;
                java.time.LocalDateTime endAt   = rs.getTimestamp("end_at")   != null ? rs.getTimestamp("end_at").toLocalDateTime()   : null;

                int dur = 1;
                if (startAt != null && endAt != null) {
                    dur = (int) Math.max(1, ChronoUnit.DAYS.between(startAt, endAt));
                }

                double promoRev = rs.getDouble("promo_revenue");
                double normalRevEquiv = normalDailyRev * dur;
                double qtyLift = rs.getDouble("quantity_lift_percent");
                double revLift = rs.getDouble("revenue_lift_percent");
                String outcome = revLift >= 5 ? "POSITIVE" : revLift <= -5 ? "NEGATIVE" : "NEUTRAL";

                windows.add(new PromoWindowSummary(
                    startAt != null ? startAt.toLocalDate().toString() : null,
                    endAt   != null ? endAt.toLocalDate().toString()   : null,
                    dur,
                    bd(rs.getDouble("discount_percent"), 2),
                    bd(qtyLift, 2),
                    bd(revLift, 2),
                    bd(promoRev, 2),
                    bd(normalRevEquiv, 2),
                    outcome
                ));
            }
        );
        return windows;
    }

    private String[] loadProductMeta(UUID marketId, UUID productId) {
        String sql =
            "select p.name, p.category, p.image_url " +
            "from products p " +
            "join invoice_items it on it.product_id = p.id " +
            "join invoices i on i.id = it.invoice_id " +
            "where i.market_id = :marketId and p.id = :productId " +
            "limit 1";
        String[][] meta = {null};
        jdbcTemplate.query(sql,
            new MapSqlParameterSource("marketId", marketId).addValue("productId", productId),
            rs -> { meta[0] = new String[]{ rs.getString("name"), rs.getString("category"), rs.getString("image_url") }; }
        );
        return meta[0];
    }

    // ── Scoring & classification ──────────────────────────────────────────────

    private String classify(double qtyLift, double revLift, int promoDays) {
        if (promoDays < MIN_PROMO_DAYS) return "INSUFFICIENT_DATA";
        if (qtyLift >= 10 && revLift >= -2)  return "BOOSTER";       // volume sobe, receita não cai
        if (qtyLift >= 5  && revLift < -5)   return "REVENUE_LOSS";  // volume sobe mas receita cai
        if (qtyLift < -5)                    return "BACKFIRE";       // promoção reduz volume
        return "NEUTRAL";
    }

    private String classificationLabel(String c) {
        return switch (c) {
            case "BOOSTER"          -> "Promoção efetiva";
            case "REVENUE_LOSS"     -> "Volume sobe, receita cai";
            case "BACKFIRE"         -> "Promoção ineficaz";
            case "NEUTRAL"          -> "Sem efeito claro";
            case "INSUFFICIENT_DATA"-> "Dados insuficientes";
            default -> c;
        };
    }

    private String buildInsight(String c, double qtyLift, double revLift, double discountPct, double elasticity, int windows) {
        // Atenção ao formato: "%s" (e não "%.s", que aplica precisão zero e
        // apaga a string inteira, deixando o texto sem número algum).
        String qtyFmt  = String.format("%.0f%%", Math.abs(qtyLift));
        String revFmt  = String.format("%.0f%%", Math.abs(revLift));
        String discFmt = String.format("%.1f%%", Math.abs(discountPct));

        // elasticity = qtyLift / discountPct, com discountPct negativo (desconto).
        // Um produto que reage ao desconto tem elasticity negativa; o ganho de
        // volume por 1% de desconto é, portanto, o valor absoluto.
        double gainPerPercent = Math.abs(elasticity);

        return switch (c) {
            case "BOOSTER" -> String.format(
                "Com %s de desconto médio, o volume cresce %s e a receita diária %s %s — promoção efetiva. " +
                "Elasticidade-preço %.2f: cada 1%% de desconto gera cerca de %.1f%% a mais de vendas.",
                discFmt, qtyFmt, revLift >= 0 ? "cresce" : "cai", revFmt, elasticity, gainPerPercent);
            case "REVENUE_LOSS" -> String.format(
                "Com %s de desconto, o volume cresce %s mas a receita diária cai %s. " +
                "O desconto é grande demais — tente reduzir para %s e validar o resultado.",
                discFmt, qtyFmt, revFmt, String.format("%.1f%%", Math.abs(discountPct) * 0.6));
            case "BACKFIRE" -> String.format(
                "Surpreendente: em dias de promoção o volume cai %s. " +
                "Possíveis causas: gôndola esvaziada rapidamente, produto de percepção premium, ou janela de promoção muito curta.",
                qtyFmt);
            case "NEUTRAL" -> String.format(
                "Promoção aplicada em %d janelas sem efeito mensurável na velocidade de venda. " +
                "Revise profundidade do desconto (atual: %s) ou comunicação no ponto de venda.",
                windows, discFmt);
            default -> "Dados insuficientes para análise conclusiva. São necessários pelo menos 5 dias em promoção e 10 dias sem.";
        };
    }

    private int computeScore(double qtyLift, double revLift, int windowCount, int promoDays, double totalPromoQty, double totalNormalQty) {
        // Qty lift component (0-40): capped at ±50%
        double qtyComponent  = Math.min(40, Math.max(0, (qtyLift / 50.0) * 40));
        // Revenue lift component (0-40): bonus if positive, penalty if negative
        double revComponent  = revLift >= 0
            ? Math.min(40, (revLift / 30.0) * 40)
            : Math.max(0, 20 + (revLift / 10.0) * 4); // 20 base, -4 per 10% drop
        // Consistency (0-20): more windows + more promo days = more confident signal
        double consistencyComponent = Math.min(20, (windowCount * 3.0) + (Math.min(promoDays, 30) / 30.0) * 10);

        return (int) Math.round(Math.min(100, Math.max(0, qtyComponent + revComponent + consistencyComponent)));
    }

    private ProductPromoEffectivenessDTO insufficientData(UUID productId, String[] meta, double baseline, DailyMetrics m) {
        return new ProductPromoEffectivenessDTO(
            productId, meta[0], meta[1], meta[2],
            bd(baseline, 2), null, null,
            m != null ? bd(m.totalNormalQty() / Math.max(1, m.normalDays()), 3) : null, null,
            m != null ? bd(m.totalNormalRevenue() / Math.max(1, m.normalDays()), 2) : null, null,
            null, null, null,
            m != null ? bd(m.totalPromoRevenue(), 2) : null,
            m != null ? bd(m.totalNormalRevenue(), 2) : null,
            m != null ? bd(m.totalPromoQty(), 3) : null,
            m != null ? bd(m.totalNormalQty(), 3) : null,
            m != null ? m.promoDays() : 0,
            m != null ? m.normalDays() : 0,
            0,
            0, "INSUFFICIENT_DATA", "Dados insuficientes",
            "São necessários pelo menos 5 dias em promoção e 10 dias normais para análise conclusiva.",
            List.of()
        );
    }

    // ── Utils ─────────────────────────────────────────────────────────────────

    private BigDecimal bd(Double value, int scale) {
        if (value == null || Double.isNaN(value) || Double.isInfinite(value)) return null;
        return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP);
    }

    private BigDecimal bd(double value, int scale) {
        if (Double.isNaN(value) || Double.isInfinite(value)) return BigDecimal.ZERO.setScale(scale, RoundingMode.HALF_UP);
        return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP);
    }
}
