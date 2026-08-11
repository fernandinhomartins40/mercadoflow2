package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.ProductCapitalMetric.CapitalStatus;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import com.pdv2cloud.service.intelligence.CapitalMetricsReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Inteligência de promoções: o que descontar, quando, e o que isso arrasta junto.
 *
 * Três perguntas que o {@link PromoEffectivenessService} não respondia:
 *
 *  1. TRAÇÃO CRUZADA (efeito halo) — quando o produto X entra em promoção,
 *     quais outros produtos vendem mais? A promoção que puxa a cesta inteira
 *     vale muito mais do que a que só desconta o próprio item. Medido comparando
 *     a velocidade dos demais produtos nos dias em que X esteve em promoção
 *     contra os dias em que não esteve, restrito a pares que de fato aparecem
 *     no mesmo cupom (senão qualquer coincidência de calendário viraria "halo").
 *
 *  2. SAZONALIDADE — em que dia da semana e em que mês cada produto vende mais.
 *     Serve para escolher a janela: descontar quando o produto já vende sozinho
 *     costuma ser margem jogada fora.
 *
 *  3. CANDIDATOS — quais produtos colocar em promoção agora, separados por
 *     objetivo: TRAÇÃO (puxa a cesta) e LIQUIDAÇÃO (libera capital parado).
 */
@Service
@Slf4j
public class PromoIntelligenceService {

    private static final int DEFAULT_WINDOW_DAYS = 180;

    /** Abaixo disso do preço de referência o dia conta como promoção. */
    private static final double PROMO_THRESHOLD_RATIO = 0.95;

    /** Mínimo de dias em promoção para o halo não ser ruído. */
    private static final int MIN_PROMO_DAYS = 4;

    /** Mínimo de cupons compartilhados para o par ser considerado real. */
    private static final int MIN_CO_OCCURRENCE = 5;

    /** Teto de produtos "driver" analisados por rodada (custo x benefício). */
    private static final int MAX_DRIVERS = 40;

    /** Mínimo de observações para um índice sazonal ser confiável. */
    private static final int MIN_SEASONAL_OBSERVATIONS = 3;

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final CapitalMetricsReader capitalMetricsReader;

    public PromoIntelligenceService(
        NamedParameterJdbcTemplate jdbcTemplate,
        CapitalMetricsReader capitalMetricsReader
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.capitalMetricsReader = capitalMetricsReader;
    }

    // ── 1. Efeito halo ───────────────────────────────────────────────────────

    /**
     * Produtos que tracionam a venda de outros quando entram em promoção.
     *
     * Estratégia: para cada driver com histórico de promoção, marca os dias em
     * promoção e compara a velocidade dos produtos co-comprados nesses dias
     * contra os demais dias.
     */
    @Transactional(readOnly = true)
    public List<HaloEffect> computeHaloEffects(UUID marketId, int windowDays) {
        int days = windowDays > 0 ? Math.min(windowDays, 365) : DEFAULT_WINDOW_DAYS;
        LocalDate since = LocalDate.now().minusDays(days);

        List<DriverCandidate> drivers = loadDrivers(marketId, since);
        if (drivers.isEmpty()) {
            return List.of();
        }

        List<HaloEffect> results = new ArrayList<>();
        for (DriverCandidate driver : drivers) {
            results.addAll(computeHaloForDriver(marketId, driver, since, days));
        }

        results.sort(Comparator.comparing(
            (HaloEffect h) -> h.incrementalRevenue() != null ? h.incrementalRevenue() : BigDecimal.ZERO
        ).reversed());
        return results;
    }

    /** Produtos com promoção detectável e volume que justifique a análise. */
    private List<DriverCandidate> loadDrivers(UUID marketId, LocalDate since) {
        String sql =
            "with daily as ( " +
            "  select it.product_id, " +
            "         cast(i.data_emissao as date) as sale_date, " +
            "         sum(it.valor_total) / nullif(sum(it.quantidade), 0) as day_avg_price, " +
            "         sum(it.valor_total) as day_revenue " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :marketId and i.data_emissao >= :since " +
            "    and it.product_id is not null and it.valor_unitario > 0 " +
            "  group by it.product_id, cast(i.data_emissao as date) " +
            "), " +
            "stats as ( " +
            "  select product_id, " +
            "         percentile_cont(0.5) within group (order by day_avg_price) as median_price, " +
            "         sum(day_revenue) as total_revenue, " +
            "         count(*) as active_days " +
            "  from daily where day_avg_price is not null " +
            "  group by product_id " +
            ") " +
            "select s.product_id, p.name, s.median_price, s.total_revenue, " +
            "       count(*) filter (where d.day_avg_price < s.median_price * :threshold) as promo_days " +
            "from stats s " +
            "join daily d on d.product_id = s.product_id " +
            "join products p on p.id = s.product_id " +
            "where s.median_price > 0 and s.active_days >= :minActiveDays " +
            "group by s.product_id, p.name, s.median_price, s.total_revenue " +
            "having count(*) filter (where d.day_avg_price < s.median_price * :threshold) >= :minPromoDays " +
            "order by s.total_revenue desc " +
            "limit :maxDrivers";

        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("since", since.atStartOfDay())
            .addValue("threshold", PROMO_THRESHOLD_RATIO)
            .addValue("minPromoDays", MIN_PROMO_DAYS)
            .addValue("minActiveDays", MIN_PROMO_DAYS * 3)
            .addValue("maxDrivers", MAX_DRIVERS);

        List<DriverCandidate> out = new ArrayList<>();
        RowCallbackHandler handler = rs -> out.add(new DriverCandidate(
            UUID.fromString(rs.getString("product_id")),
            rs.getString("name"),
            rs.getBigDecimal("median_price"),
            rs.getInt("promo_days")
        ));
        jdbcTemplate.query(sql, params, handler);
        return out;
    }

    /**
     * Halo de um driver específico.
     *
     * O filtro por co-ocorrência em cupom é o que separa causalidade plausível
     * de coincidência: sem ele, dois produtos que simplesmente vendem mais no
     * mesmo dia da semana apareceriam como se um puxasse o outro.
     */
    private List<HaloEffect> computeHaloForDriver(
        UUID marketId, DriverCandidate driver, LocalDate since, int windowDays
    ) {
        String sql =
            // Dias em que o driver esteve (ou não) em promoção.
            "with driver_daily as ( " +
            "  select cast(i.data_emissao as date) as sale_date, " +
            "         sum(it.valor_total) / nullif(sum(it.quantidade), 0) as day_avg_price " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :marketId and it.product_id = :driverId " +
            "    and i.data_emissao >= :since and it.valor_unitario > 0 " +
            "  group by cast(i.data_emissao as date) " +
            "), " +
            "flagged_days as ( " +
            "  select sale_date, " +
            "         case when day_avg_price < :promoPrice then true else false end as is_promo " +
            "  from driver_daily where day_avg_price is not null " +
            "), " +
            "day_counts as ( " +
            "  select count(*) filter (where is_promo)     as promo_days, " +
            "         count(*) filter (where not is_promo) as normal_days " +
            "  from flagged_days " +
            "), " +
            // Produtos que dividem cupom com o driver: candidatos legítimos a halo.
            "co_purchased as ( " +
            "  select other.product_id, count(distinct i.id) as co_count " +
            "  from invoice_items base " +
            "  join invoices i on i.id = base.invoice_id " +
            "  join invoice_items other on other.invoice_id = i.id and other.product_id <> base.product_id " +
            "  where i.market_id = :marketId and base.product_id = :driverId " +
            "    and i.data_emissao >= :since and other.product_id is not null " +
            "  group by other.product_id " +
            "  having count(distinct i.id) >= :minCoOccurrence " +
            "), " +
            // Venda dos co-comprados separada entre dias promo e dias normais.
            "target_daily as ( " +
            "  select it.product_id, " +
            "         fd.is_promo, " +
            "         sum(it.quantidade)  as qty, " +
            "         sum(it.valor_total) as revenue " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  join flagged_days fd on fd.sale_date = cast(i.data_emissao as date) " +
            "  join co_purchased cp on cp.product_id = it.product_id " +
            "  where i.market_id = :marketId and i.data_emissao >= :since " +
            "  group by it.product_id, fd.is_promo " +
            ") " +
            "select td.product_id, p.name, cp.co_count, " +
            "       dc.promo_days, dc.normal_days, " +
            "       coalesce(sum(td.qty)     filter (where td.is_promo), 0)     as promo_qty, " +
            "       coalesce(sum(td.qty)     filter (where not td.is_promo), 0) as normal_qty, " +
            "       coalesce(sum(td.revenue) filter (where td.is_promo), 0)     as promo_revenue " +
            "from target_daily td " +
            "join products p on p.id = td.product_id " +
            "join co_purchased cp on cp.product_id = td.product_id " +
            "cross join day_counts dc " +
            "group by td.product_id, p.name, cp.co_count, dc.promo_days, dc.normal_days";

        BigDecimal promoPrice = driver.medianPrice()
            .multiply(BigDecimal.valueOf(PROMO_THRESHOLD_RATIO));

        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("driverId", driver.productId())
            .addValue("since", since.atStartOfDay())
            .addValue("promoPrice", promoPrice)
            .addValue("minCoOccurrence", MIN_CO_OCCURRENCE);

        List<HaloEffect> out = new ArrayList<>();
        // RowCallbackHandler explícito: com `return` dentro do lambda o compilador
        // não consegue escolher entre esta sobrecarga e ResultSetExtractor.
        RowCallbackHandler handler = rs -> {
            int promoDays = rs.getInt("promo_days");
            int normalDays = rs.getInt("normal_days");
            if (promoDays < MIN_PROMO_DAYS || normalDays < MIN_PROMO_DAYS) {
                return;
            }

            double promoQty = rs.getDouble("promo_qty");
            double normalQty = rs.getDouble("normal_qty");
            double promoVelocity = promoQty / promoDays;
            double normalVelocity = normalQty / normalDays;
            if (normalVelocity <= 0) {
                return;
            }

            double liftPercent = (promoVelocity / normalVelocity - 1.0) * 100.0;

            // Receita incremental: o que se vendeu a mais do que a linha de base
            // teria produzido nos mesmos dias.
            double promoRevenue = rs.getDouble("promo_revenue");
            double baselineRevenue = promoQty > 0
                ? promoRevenue / promoQty * normalVelocity * promoDays
                : 0.0;
            double incremental = promoRevenue - baselineRevenue;

            int coCount = rs.getInt("co_count");
            // Confiança sobe com dias observados e com a força da co-ocorrência.
            double confidence = Math.min(1.0,
                (Math.min(promoDays, 20) / 20.0) * 0.6 + (Math.min(coCount, 50) / 50.0) * 0.4);

            out.add(new HaloEffect(
                driver.productId(), driver.name(),
                UUID.fromString(rs.getString("product_id")), rs.getString("name"),
                BigDecimal.valueOf(promoVelocity).setScale(4, RoundingMode.HALF_UP),
                BigDecimal.valueOf(normalVelocity).setScale(4, RoundingMode.HALF_UP),
                BigDecimal.valueOf(liftPercent).setScale(2, RoundingMode.HALF_UP),
                BigDecimal.valueOf(incremental).setScale(2, RoundingMode.HALF_UP),
                coCount, promoDays,
                BigDecimal.valueOf(confidence).setScale(4, RoundingMode.HALF_UP),
                windowDays
            ));
        };
        jdbcTemplate.query(sql, params, handler);

        // Só interessa quem realmente puxa venda.
        return out.stream()
            .filter(h -> h.haloLiftPercent().doubleValue() > 5.0)
            .filter(h -> h.confidence().doubleValue() >= 0.3)
            .toList();
    }

    /** Ranking de drivers por receita incremental total gerada nos outros produtos. */
    @Transactional(readOnly = true)
    public List<TrafficDriver> rankTrafficDrivers(UUID marketId, int windowDays) {
        List<HaloEffect> halos = computeHaloEffects(marketId, windowDays);

        Map<UUID, TrafficDriverAccumulator> byDriver = new HashMap<>();
        for (HaloEffect halo : halos) {
            byDriver.computeIfAbsent(
                halo.driverProductId(),
                key -> new TrafficDriverAccumulator(halo.driverProductId(), halo.driverName())
            ).add(halo);
        }

        return byDriver.values().stream()
            .map(TrafficDriverAccumulator::build)
            .sorted(Comparator.comparing(TrafficDriver::totalIncrementalRevenue).reversed())
            .toList();
    }

    // ── 2. Sazonalidade ──────────────────────────────────────────────────────

    /**
     * Índices sazonais por dia da semana e por mês.
     *
     * O índice é a razão entre a venda média do período e a venda média geral do
     * produto: 1.35 no sábado significa 35% acima da média num sábado típico.
     */
    @Transactional(readOnly = true)
    public List<SeasonalIndex> computeSeasonality(UUID marketId, UUID productId, int windowDays) {
        int days = windowDays > 0 ? Math.min(windowDays, 730) : 365;
        LocalDate since = LocalDate.now().minusDays(days);

        List<SeasonalIndex> out = new ArrayList<>();
        out.addAll(seasonalityFor(marketId, productId, since, "DOW", days));
        out.addAll(seasonalityFor(marketId, productId, since, "MONTH", days));
        return out;
    }

    private List<SeasonalIndex> seasonalityFor(
        UUID marketId, UUID productId, LocalDate since, String periodType, int windowDays
    ) {
        // extract(dow) devolve 0=domingo; extract(month) devolve 1..12.
        String periodExpr = "DOW".equals(periodType)
            ? "extract(dow from i.data_emissao)"
            : "extract(month from i.data_emissao)";

        String sql =
            "with daily as ( " +
            "  select cast(i.data_emissao as date) as sale_date, " +
            "         " + periodExpr + " as period_index, " +
            "         sum(it.quantidade) as day_qty " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :marketId and i.data_emissao >= :since " +
            (productId != null ? "    and it.product_id = :productId " : "    and it.product_id is not null ") +
            "  group by cast(i.data_emissao as date), " + periodExpr + " " +
            "), " +
            "overall as ( select avg(day_qty) as avg_all from daily ) " +
            "select d.period_index, " +
            "       avg(d.day_qty)  as avg_qty, " +
            "       count(*)        as observations, " +
            "       o.avg_all " +
            "from daily d cross join overall o " +
            "group by d.period_index, o.avg_all " +
            "order by d.period_index";

        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("since", since.atStartOfDay());
        if (productId != null) {
            params.addValue("productId", productId);
        }

        List<SeasonalIndex> out = new ArrayList<>();
        RowCallbackHandler handler = rs -> {
            double avgAll = rs.getDouble("avg_all");
            if (avgAll <= 0) {
                return;
            }
            int observations = rs.getInt("observations");
            double index = rs.getDouble("avg_qty") / avgAll;

            // Poucas observações produzem índices instáveis: reporta com
            // confiança baixa em vez de omitir, para a UI decidir o que exibir.
            double confidence = Math.min(1.0, observations / 12.0);

            out.add(new SeasonalIndex(
                periodType,
                rs.getInt("period_index"),
                periodLabel(periodType, rs.getInt("period_index")),
                BigDecimal.valueOf(index).setScale(4, RoundingMode.HALF_UP),
                observations,
                BigDecimal.valueOf(confidence).setScale(4, RoundingMode.HALF_UP),
                observations >= MIN_SEASONAL_OBSERVATIONS,
                windowDays
            ));
        };
        jdbcTemplate.query(sql, params, handler);
        return out;
    }

    private static String periodLabel(String periodType, int index) {
        if ("DOW".equals(periodType)) {
            return switch (index) {
                case 0 -> "Domingo";
                case 1 -> "Segunda";
                case 2 -> "Terça";
                case 3 -> "Quarta";
                case 4 -> "Quinta";
                case 5 -> "Sexta";
                case 6 -> "Sábado";
                default -> "?";
            };
        }
        return switch (index) {
            case 1 -> "Janeiro";   case 2 -> "Fevereiro"; case 3 -> "Março";
            case 4 -> "Abril";     case 5 -> "Maio";      case 6 -> "Junho";
            case 7 -> "Julho";     case 8 -> "Agosto";    case 9 -> "Setembro";
            case 10 -> "Outubro";  case 11 -> "Novembro"; case 12 -> "Dezembro";
            default -> "?";
        };
    }

    // ── 3. Candidatos a promoção ─────────────────────────────────────────────

    /**
     * Quais produtos colocar em promoção agora, e por quê.
     *
     * Dois objetivos distintos, que pedem produtos distintos:
     *
     *  TRAÇÃO      — produtos que puxam a cesta. Escolhidos pelo halo medido,
     *                não por intuição. Descontar aqui compra tráfego.
     *  LIQUIDAÇÃO  — produtos com capital parado e giro caindo. Descontar aqui
     *                devolve dinheiro ao caixa antes que o produto trave de vez.
     */
    @Transactional(readOnly = true)
    public PromoRecommendations recommend(UUID marketId, int windowDays) {
        List<CapitalMetric> portfolio = capitalMetricsReader.portfolio(marketId, 90);
        Map<UUID, CapitalMetric> byProduct = new HashMap<>();
        for (CapitalMetric metric : portfolio) {
            byProduct.put(metric.productId(), metric);
        }

        List<TrafficDriver> drivers = rankTrafficDrivers(marketId, windowDays);

        // ── Tração ──
        List<PromoCandidate> traction = new ArrayList<>();
        for (TrafficDriver driver : drivers) {
            CapitalMetric metric = byProduct.get(driver.productId());
            double score = Math.min(100,
                40 + Math.min(35, driver.totalIncrementalRevenue().doubleValue() / 100.0)
                   + Math.min(25, driver.affectedProducts() * 2.5));

            String reason = String.format(
                "Quando entra em promoção, puxa a venda de %d produto(s) e gera %s de receita adicional "
                    + "na cesta (lift médio de %.0f%% nos itens acompanhados). "
                    + "Descontar aqui compra tráfego para a loja inteira.",
                driver.affectedProducts(),
                money(driver.totalIncrementalRevenue()),
                driver.averageLiftPercent().doubleValue());

            traction.add(new PromoCandidate(
                driver.productId(), driver.driverName(),
                metric != null ? metric.category() : null,
                metric != null ? metric.imageUrl() : null,
                "TRACAO",
                BigDecimal.valueOf(score).setScale(2, RoundingMode.HALF_UP),
                reason,
                metric != null ? metric.unitPrice() : null,
                suggestedDiscount(metric, "TRACAO"),
                metric != null ? metric.grossMarginPercent() : null,
                metric != null ? metric.dailyVelocity() : null,
                metric != null ? metric.coverageDays() : null,
                metric != null ? metric.inventoryValue() : null,
                driver.totalIncrementalRevenue(),
                driver.affectedProducts(),
                driver.topTargets()
            ));
        }

        // ── Liquidação ──
        List<PromoCandidate> clearance = portfolio.stream()
            .filter(m -> m.capitalStatus() == CapitalStatus.LIQUIDAR
                || (m.capitalStatus() == CapitalStatus.REDUZIR
                    && m.stagnationRisk() != null && m.stagnationRisk().doubleValue() >= 0.45))
            .filter(m -> m.inventoryValue() != null && m.inventoryValue().signum() > 0)
            .sorted(Comparator.comparing(CapitalMetric::inventoryValue).reversed())
            .limit(30)
            .map(m -> {
                double risk = m.stagnationRisk() != null ? m.stagnationRisk().doubleValue() : 0.5;
                double score = Math.min(100, 40 + risk * 40
                    + Math.min(20, m.inventoryValue().doubleValue() / 500.0));

                String coverageText = m.coverageDays() != null
                    ? String.format("%.0f dias de estoque", m.coverageDays().doubleValue())
                    : "estoque acima do giro";

                String reason = String.format(
                    "%s em %s parado, com giro de %.2f un./dia e demanda %s. "
                        + "Uma promoção agora devolve esse capital ao caixa antes que o produto trave na prateleira.",
                    money(m.inventoryValue()), coverageText, m.dailyVelocity().doubleValue(),
                    m.momentumScore() != null && m.momentumScore().doubleValue() < 1
                        ? "em queda" : "estável");

                return new PromoCandidate(
                    m.productId(), m.name(), m.category(), m.imageUrl(),
                    "LIQUIDACAO",
                    BigDecimal.valueOf(score).setScale(2, RoundingMode.HALF_UP),
                    reason,
                    m.unitPrice(), suggestedDiscount(m, "LIQUIDACAO"),
                    m.grossMarginPercent(), m.dailyVelocity(), m.coverageDays(),
                    m.inventoryValue(), null, 0, List.of()
                );
            })
            .toList();

        traction.sort(Comparator.comparing(PromoCandidate::score).reversed());
        return new PromoRecommendations(traction, clearance);
    }

    /**
     * Desconto sugerido.
     *
     * Tração usa desconto moderado — o objetivo é atrair, não queimar margem.
     * Liquidação escala com o risco de estagnação, mas nunca ultrapassa a margem
     * disponível: sugerir desconto que venderia com prejuízo seria pior do que
     * o problema que se quer resolver.
     */
    private BigDecimal suggestedDiscount(CapitalMetric metric, String objective) {
        double base = "LIQUIDACAO".equals(objective) ? 15.0 : 8.0;

        if (metric != null && "LIQUIDACAO".equals(objective) && metric.stagnationRisk() != null) {
            base += metric.stagnationRisk().doubleValue() * 15.0;
        }

        if (metric != null && metric.grossMarginPercent() != null) {
            double margin = metric.grossMarginPercent().doubleValue();
            // Teto: 70% da margem, para a venda seguir positiva.
            double ceiling = Math.max(5.0, margin * 0.7);
            base = Math.min(base, ceiling);
        }

        return BigDecimal.valueOf(base).setScale(1, RoundingMode.HALF_UP);
    }

    private static String money(BigDecimal value) {
        if (value == null) {
            return "R$ 0,00";
        }
        return String.format("R$ %,.2f", value);
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    private record DriverCandidate(UUID productId, String name, BigDecimal medianPrice, int promoDays) {}

    private static final class TrafficDriverAccumulator {
        private final UUID productId;
        private final String name;
        private final List<HaloEffect> halos = new ArrayList<>();

        TrafficDriverAccumulator(UUID productId, String name) {
            this.productId = productId;
            this.name = name;
        }

        void add(HaloEffect halo) {
            halos.add(halo);
        }

        TrafficDriver build() {
            BigDecimal totalIncremental = halos.stream()
                .map(HaloEffect::incrementalRevenue)
                .filter(v -> v != null && v.signum() > 0)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

            double avgLift = halos.stream()
                .mapToDouble(h -> h.haloLiftPercent().doubleValue())
                .average().orElse(0.0);

            List<HaloTarget> top = halos.stream()
                .sorted(Comparator.comparing(
                    (HaloEffect h) -> h.incrementalRevenue() != null ? h.incrementalRevenue() : BigDecimal.ZERO
                ).reversed())
                .limit(5)
                .map(h -> new HaloTarget(
                    h.targetProductId(), h.targetName(),
                    h.haloLiftPercent(), h.incrementalRevenue()))
                .toList();

            return new TrafficDriver(
                productId, name, halos.size(),
                totalIncremental.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.valueOf(avgLift).setScale(2, RoundingMode.HALF_UP),
                top
            );
        }
    }

    public record HaloEffect(
        UUID driverProductId, String driverName,
        UUID targetProductId, String targetName,
        BigDecimal targetPromoVelocity, BigDecimal targetNormalVelocity,
        BigDecimal haloLiftPercent, BigDecimal incrementalRevenue,
        int coOccurrenceCount, int promoDaysObserved,
        BigDecimal confidence, int windowDays
    ) {}

    public record HaloTarget(
        UUID productId, String name,
        BigDecimal liftPercent, BigDecimal incrementalRevenue
    ) {}

    public record TrafficDriver(
        UUID productId, String driverName, int affectedProducts,
        BigDecimal totalIncrementalRevenue, BigDecimal averageLiftPercent,
        List<HaloTarget> topTargets
    ) {}

    public record SeasonalIndex(
        String periodType, int periodIndex, String periodLabel,
        BigDecimal seasonalIndex, int observations,
        BigDecimal confidence, boolean reliable, int windowDays
    ) {}

    public record PromoCandidate(
        UUID productId, String name, String category, String imageUrl,
        String objective, BigDecimal score, String reason,
        BigDecimal currentPrice, BigDecimal suggestedDiscountPercent,
        BigDecimal marginPercent, BigDecimal dailyVelocity, BigDecimal coverageDays,
        BigDecimal capitalAtRisk,
        BigDecimal expectedIncrementalRevenue, int affectedProducts,
        List<HaloTarget> topTargets
    ) {}

    public record PromoRecommendations(
        List<PromoCandidate> traction,
        List<PromoCandidate> clearance
    ) {}
}
