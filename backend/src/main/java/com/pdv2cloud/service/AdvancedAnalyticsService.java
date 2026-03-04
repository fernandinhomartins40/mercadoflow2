package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.AlertDTO;
import com.pdv2cloud.model.dto.CampaignImpactDTO;
import com.pdv2cloud.model.dto.MarketCockpitDTO;
import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.dto.ProductPairInsightDTO;
import com.pdv2cloud.model.dto.ProductPerformanceDTO;
import com.pdv2cloud.model.dto.PromotionImpactDTO;
import com.pdv2cloud.model.dto.RecentInvoiceSummaryDTO;
import com.pdv2cloud.model.dto.SalesTrendPointDTO;
import com.pdv2cloud.model.dto.SeasonalityPointDTO;
import com.pdv2cloud.model.entity.Alert;
import com.pdv2cloud.model.entity.Campaign;
import com.pdv2cloud.repository.AlertRepository;
import com.pdv2cloud.repository.CampaignRepository;
import com.pdv2cloud.repository.InvoiceRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Month;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AdvancedAnalyticsService {

    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    @Autowired
    private InvoiceRepository invoiceRepository;

    @Autowired
    private AlertRepository alertRepository;

    @Autowired
    private CampaignRepository campaignRepository;

    @Autowired
    private MarketBasketService marketBasketService;

    public MarketCockpitDTO getCockpit(UUID marketId, LocalDate startDate, LocalDate endDate) {
        Window window = resolveWindow(startDate, endDate, 90);

        MarketCockpitDTO cockpit = new MarketCockpitDTO();
        Overview overview = loadOverview(marketId, window);
        cockpit.setTotalRevenue(overview.totalRevenue());
        cockpit.setAverageTicket(overview.averageTicket());
        cockpit.setTotalTransactions(overview.totalTransactions());
        cockpit.setActiveProducts(overview.activeProducts());
        cockpit.setGrowthPercentage(overview.growthPercentage());
        cockpit.setPromoRevenueShare(overview.promoRevenueShare());
        cockpit.setCampaignsRunning(countRunningCampaigns(marketId));
        cockpit.setTopProducts(fetchProductPerformance(marketId, window, null, "REVENUE", PageRequest.of(0, 5)).getContent());
        cockpit.setSlowMovers(fetchProductPerformance(marketId, window, null, "TURNOVER_ASC", PageRequest.of(0, 5)).getContent());
        cockpit.setTopTurnoverProducts(fetchProductPerformance(marketId, window, null, "TURNOVER", PageRequest.of(0, 5)).getContent());
        cockpit.setLowTurnoverProducts(fetchProductPerformance(marketId, window, null, "TREND_ASC", PageRequest.of(0, 5)).getContent());
        cockpit.setPromotionHighlights(fetchPromotionHighlights(marketId, window, 6));
        cockpit.setWeekdaySeasonality(fetchSeasonality(marketId, window, SeasonalityGranularity.WEEKDAY));
        cockpit.setHourlySeasonality(fetchSeasonality(marketId, window, SeasonalityGranularity.HOUR));
        cockpit.setMonthlySeasonality(fetchSeasonality(marketId, window, SeasonalityGranularity.MONTH));
        cockpit.setTopPairs(fetchBasketHighlights(marketId, 8));
        cockpit.setCampaignImpacts(fetchCampaignImpacts(marketId));
        cockpit.setSalesTrend(fetchSalesTrend(marketId, window));
        cockpit.setRecentInvoices(invoiceRepository.findRecentInvoiceSummaries(marketId, PageRequest.of(0, 6)));
        cockpit.setRecentAlerts(alertRepository.findByMarketId(marketId).stream()
            .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
            .limit(6)
            .map(this::mapAlert)
            .toList());
        return cockpit;
    }

    public Page<ProductPerformanceDTO> getProductPerformance(
        UUID marketId,
        LocalDate startDate,
        LocalDate endDate,
        String category,
        String sortBy,
        Pageable pageable
    ) {
        Window window = resolveWindow(startDate, endDate, 90);
        return fetchProductPerformance(marketId, window, category, sortBy, pageable);
    }

    public List<CampaignImpactDTO> getCampaignImpacts(UUID marketId) {
        return fetchCampaignImpacts(marketId);
    }

    public List<SeasonalityPointDTO> getWeekdaySeasonality(UUID marketId, LocalDate startDate, LocalDate endDate) {
        return fetchSeasonality(marketId, resolveWindow(startDate, endDate, 90), SeasonalityGranularity.WEEKDAY);
    }

    private Page<ProductPerformanceDTO> fetchProductPerformance(
        UUID marketId,
        Window window,
        String category,
        String sortBy,
        Pageable pageable
    ) {
        String orderBy = resolveSort(sortBy);
        MapSqlParameterSource params = baseProductParams(marketId, window, category)
            .addValue("limit", pageable.getPageSize())
            .addValue("offset", pageable.getOffset());

        String cte = productPerformanceCte();
        List<ProductPerformanceDTO> content = jdbcTemplate.query(
            cte +
            "select cp.product_id, cp.ean, cp.name, cp.category, cp.revenue, cp.quantity_sold, cp.average_price, cp.transaction_count, " +
            "cp.sales_days, cp.sales_velocity, cp.promo_revenue, cp.promo_quantity, cp.normal_revenue, cp.normal_quantity, " +
            "cp.baseline_price, cp.promo_average_price, cp.normal_average_price, cp.promo_revenue_share, cp.price_index, " +
            "cp.revenue_trend_percentage, cp.last_sold_at, cp.turnover_band " +
            "from current_period cp order by " + orderBy + " limit :limit offset :offset",
            params,
            productPerformanceRowMapper()
        );

        Long total = jdbcTemplate.queryForObject(
            cte + "select count(*) from current_period",
            params,
            Long.class
        );

        return new PageImpl<>(content, pageable, total != null ? total : 0);
    }

    private Overview loadOverview(UUID marketId, Window window) {
        MapSqlParameterSource params = baseProductParams(marketId, window, null);
        BigDecimal totalRevenue = jdbcTemplate.queryForObject(
            "select coalesce(sum(i.valor_total), 0) from invoices i " +
            "where i.market_id = :marketId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive",
            params,
            BigDecimal.class
        );
        Long totalTransactions = jdbcTemplate.queryForObject(
            "select count(*) from invoices i " +
            "where i.market_id = :marketId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive",
            params,
            Long.class
        );
        Integer activeProducts = jdbcTemplate.queryForObject(
            "select count(distinct it.product_id) from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "where i.market_id = :marketId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive",
            params,
            Integer.class
        );
        BigDecimal promoRevenue = jdbcTemplate.queryForObject(
            productPerformanceCte() + "select coalesce(sum(cp.promo_revenue), 0) from current_period cp",
            params,
            BigDecimal.class
        );
        BigDecimal previousRevenue = jdbcTemplate.queryForObject(
            "select coalesce(sum(i.valor_total), 0) from invoices i " +
            "where i.market_id = :marketId and i.data_emissao >= :previousStart and i.data_emissao < :startDate",
            params,
            BigDecimal.class
        );

        totalRevenue = defaultBigDecimal(totalRevenue);
        previousRevenue = defaultBigDecimal(previousRevenue);
        promoRevenue = defaultBigDecimal(promoRevenue);
        long transactions = totalTransactions != null ? totalTransactions : 0;
        BigDecimal averageTicket = transactions > 0
            ? totalRevenue.divide(BigDecimal.valueOf(transactions), 2, RoundingMode.HALF_UP)
            : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal promoRevenueShare = totalRevenue.compareTo(BigDecimal.ZERO) > 0
            ? promoRevenue.divide(totalRevenue, 4, RoundingMode.HALF_UP)
            : BigDecimal.ZERO.setScale(4, RoundingMode.HALF_UP);

        return new Overview(
            totalRevenue,
            averageTicket,
            transactions,
            activeProducts != null ? activeProducts : 0,
            calculateGrowth(totalRevenue, previousRevenue),
            promoRevenueShare
        );
    }

    private List<ProductPairInsightDTO> fetchBasketHighlights(UUID marketId, int limit) {
        List<MarketBasketDTO> rules = marketBasketService.analyzeMarketBasket(marketId, 0.01, 0.15);
        return rules.stream()
            .limit(limit)
            .map(rule -> new ProductPairInsightDTO(
                rule.getAntecedent().isEmpty() ? null : rule.getAntecedent().get(0),
                rule.getConsequent().isEmpty() ? null : rule.getConsequent().get(0),
                rule.getAntecedentNames() == null || rule.getAntecedentNames().isEmpty() ? null : rule.getAntecedentNames().get(0),
                rule.getConsequentNames() == null || rule.getConsequentNames().isEmpty() ? null : rule.getConsequentNames().get(0),
                rule.getSupport(),
                rule.getConfidence(),
                rule.getLift(),
                rule.getPairCount()
            ))
            .toList();
    }

    private List<PromotionImpactDTO> fetchPromotionHighlights(UUID marketId, Window window, int limit) {
        return fetchProductPerformance(marketId, window, null, "PROMO", PageRequest.of(0, limit * 2)).getContent().stream()
            .filter(row -> defaultBigDecimal(row.getPromoRevenue()).compareTo(BigDecimal.ZERO) > 0
                || defaultBigDecimal(row.getPromoQuantity()).compareTo(BigDecimal.ZERO) > 0)
            .limit(limit)
            .map(row -> {
                double quantityLift = calculateLift(
                    defaultBigDecimal(row.getPromoQuantity()),
                    defaultBigDecimal(row.getNormalQuantity())
                );
                double revenueLift = calculateLift(
                    defaultBigDecimal(row.getPromoRevenue()),
                    defaultBigDecimal(row.getNormalRevenue())
                );
                return new PromotionImpactDTO(
                    row.getProductId(),
                    row.getName(),
                    row.getCategory(),
                    row.getBaselinePrice(),
                    row.getPromoAveragePrice(),
                    row.getNormalAveragePrice(),
                    row.getPromoRevenue(),
                    row.getNormalRevenue(),
                    row.getPromoQuantity(),
                    row.getNormalQuantity(),
                    quantityLift,
                    revenueLift
                );
            })
            .toList();
    }

    private List<SeasonalityPointDTO> fetchSeasonality(UUID marketId, Window window, SeasonalityGranularity granularity) {
        String select;
        String groupBy;
        String orderBy;
        switch (granularity) {
            case WEEKDAY -> {
                select = "cast(extract(dow from i.data_emissao) as integer) as bucket";
                groupBy = "cast(extract(dow from i.data_emissao) as integer)";
                orderBy = "bucket";
            }
            case HOUR -> {
                select = "cast(extract(hour from i.data_emissao) as integer) as bucket";
                groupBy = "cast(extract(hour from i.data_emissao) as integer)";
                orderBy = "bucket";
            }
            case MONTH -> {
                select = "cast(extract(month from i.data_emissao) as integer) as bucket";
                groupBy = "cast(extract(month from i.data_emissao) as integer)";
                orderBy = "bucket";
            }
            default -> throw new IllegalStateException("Unsupported granularity");
        }

        return jdbcTemplate.query(
            "select " + select + ", coalesce(sum(it.valor_total), 0) as revenue, " +
            "coalesce(sum(it.quantidade), 0) as quantity, count(distinct i.id) as transactions, " +
            "coalesce(sum(it.valor_total) / nullif(count(distinct i.id), 0), 0) as average_ticket " +
            "from invoice_items it join invoices i on i.id = it.invoice_id " +
            "where i.market_id = :marketId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive " +
            "group by " + groupBy + " order by " + orderBy,
            baseProductParams(marketId, window, null),
            (rs, rowNum) -> mapSeasonality(granularity, rs)
        );
    }

    private List<SalesTrendPointDTO> fetchSalesTrend(UUID marketId, Window window) {
        return jdbcTemplate.query(
            "select date(i.data_emissao) as sale_date, coalesce(sum(i.valor_total), 0) as revenue " +
            "from invoices i where i.market_id = :marketId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive " +
            "group by date(i.data_emissao) order by sale_date",
            baseProductParams(marketId, window, null),
            (rs, rowNum) -> new SalesTrendPointDTO(
                rs.getDate("sale_date").toLocalDate(),
                defaultBigDecimal(rs.getBigDecimal("revenue"))
            )
        );
    }

    private List<CampaignImpactDTO> fetchCampaignImpacts(UUID marketId) {
        List<Campaign> campaigns = campaignRepository.findByMarketId(marketId);
        return campaigns.stream()
            .filter(c -> c.getStartDate() != null && c.getEndDate() != null)
            .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
            .map(campaign -> computeCampaignImpact(marketId, campaign))
            .toList();
    }

    private CampaignImpactDTO computeCampaignImpact(UUID marketId, Campaign campaign) {
        LocalDateTime start = campaign.getStartDate();
        LocalDateTime endExclusive = campaign.getEndDate().plusSeconds(1);
        long durationDays = Math.max(1, ChronoUnit.DAYS.between(start.toLocalDate(), campaign.getEndDate().toLocalDate()) + 1);
        LocalDateTime beforeStart = start.minusDays(durationDays);
        LocalDateTime afterEnd = endExclusive.plusDays(durationDays);

        Aggregate before = aggregateInvoices(marketId, beforeStart, start);
        Aggregate during = aggregateInvoices(marketId, start, endExclusive);
        Aggregate after = aggregateInvoices(marketId, endExclusive, afterEnd);

        LocalDateTime now = LocalDateTime.now();
        String status = now.isBefore(start) ? "SCHEDULED" : now.isAfter(campaign.getEndDate()) ? "ENDED" : "RUNNING";

        return new CampaignImpactDTO(
            campaign.getId(),
            campaign.getName(),
            campaign.getDescription(),
            campaign.getStartDate(),
            campaign.getEndDate(),
            status,
            (int) durationDays,
            before.revenue(),
            during.revenue(),
            after.revenue(),
            before.transactions(),
            during.transactions(),
            after.transactions(),
            before.averageTicket(),
            during.averageTicket(),
            after.averageTicket(),
            calculateGrowth(during.revenue(), before.revenue()),
            calculateGrowth(BigDecimal.valueOf(during.transactions()), BigDecimal.valueOf(before.transactions()))
        );
    }

    private Aggregate aggregateInvoices(UUID marketId, LocalDateTime start, LocalDateTime endExclusive) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("start", Timestamp.valueOf(start))
            .addValue("end", Timestamp.valueOf(endExclusive));

        return jdbcTemplate.queryForObject(
            "select coalesce(sum(i.valor_total), 0) as revenue, count(*) as transactions, " +
            "coalesce(sum(i.valor_total) / nullif(count(*), 0), 0) as average_ticket " +
            "from invoices i where i.market_id = :marketId and i.data_emissao >= :start and i.data_emissao < :end",
            params,
            (rs, rowNum) -> new Aggregate(
                defaultBigDecimal(rs.getBigDecimal("revenue")),
                rs.getLong("transactions"),
                defaultBigDecimal(rs.getBigDecimal("average_ticket"))
            )
        );
    }

    private long countRunningCampaigns(UUID marketId) {
        LocalDateTime now = LocalDateTime.now();
        return campaignRepository.findByMarketId(marketId).stream()
            .filter(c -> c.getStartDate() != null && c.getEndDate() != null)
            .filter(c -> !now.isBefore(c.getStartDate()) && !now.isAfter(c.getEndDate()))
            .count();
    }

    private MapSqlParameterSource baseProductParams(UUID marketId, Window window, String category) {
        return new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("startDate", window.start().atStartOfDay())
            .addValue("endExclusive", window.end().plusDays(1).atStartOfDay())
            .addValue("previousStart", window.start().minusDays(window.lengthDays()).atStartOfDay())
            .addValue("baselineStart", window.start().minusDays(Math.max(window.lengthDays(), 90)).atStartOfDay())
            .addValue("category", category == null || category.isBlank() ? null : category.trim());
    }

    private String productPerformanceCte() {
        return
            "with market_products as (" +
            "    select distinct p.id, p.ean, p.name, p.category " +
            "    from invoice_items it " +
            "    join invoices i on i.id = it.invoice_id " +
            "    join products p on p.id = it.product_id " +
            "    where i.market_id = :marketId and (:category is null or p.category = :category)" +
            "), baseline as (" +
            "    select it.product_id, avg(it.valor_unitario) as baseline_price " +
            "    from invoice_items it " +
            "    join invoices i on i.id = it.invoice_id " +
            "    where i.market_id = :marketId and i.data_emissao >= :baselineStart and i.data_emissao < :endExclusive " +
            "    group by it.product_id" +
            "), current_period_raw as (" +
            "    select p.id as product_id, p.ean, p.name, p.category, " +
            "           coalesce(sum(it.valor_total), 0) as revenue, " +
            "           coalesce(sum(it.quantidade), 0) as quantity_sold, " +
            "           avg(it.valor_unitario) as average_price, " +
            "           count(distinct i.id) as transaction_count, " +
            "           count(distinct date(i.data_emissao)) as sales_days, " +
            "           max(i.data_emissao) as last_sold_at, " +
            "           coalesce(sum(case when it.valor_unitario <= coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_total else 0 end), 0) as promo_revenue, " +
            "           coalesce(sum(case when it.valor_unitario <= coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.quantidade else 0 end), 0) as promo_quantity, " +
            "           coalesce(sum(case when it.valor_unitario > coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_total else 0 end), 0) as normal_revenue, " +
            "           coalesce(sum(case when it.valor_unitario > coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.quantidade else 0 end), 0) as normal_quantity, " +
            "           avg(case when it.valor_unitario <= coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_unitario end) as promo_average_price, " +
            "           avg(case when it.valor_unitario > coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_unitario end) as normal_average_price, " +
            "           coalesce(avg(case when coalesce(b.baseline_price, 0) > 0 then it.valor_unitario / b.baseline_price end), 1) as price_index, " +
            "           coalesce(b.baseline_price, avg(it.valor_unitario)) as baseline_price " +
            "    from invoice_items it " +
            "    join invoices i on i.id = it.invoice_id " +
            "    join products p on p.id = it.product_id " +
            "    left join baseline b on b.product_id = p.id " +
            "    where i.market_id = :marketId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive " +
            "      and (:category is null or p.category = :category) " +
            "    group by p.id, p.ean, p.name, p.category, b.baseline_price" +
            "), previous_period as (" +
            "    select it.product_id, coalesce(sum(it.valor_total), 0) as previous_revenue " +
            "    from invoice_items it " +
            "    join invoices i on i.id = it.invoice_id " +
            "    join products p on p.id = it.product_id " +
            "    where i.market_id = :marketId and i.data_emissao >= :previousStart and i.data_emissao < :startDate " +
            "      and (:category is null or p.category = :category) " +
            "    group by it.product_id" +
            "), last_sales as (" +
            "    select it.product_id, max(i.data_emissao) as last_sold_at " +
            "    from invoice_items it " +
            "    join invoices i on i.id = it.invoice_id " +
            "    where i.market_id = :marketId " +
            "    group by it.product_id" +
            "), current_period as (" +
            "    select mp.id as product_id, mp.ean, mp.name, mp.category, " +
            "           coalesce(cpr.revenue, 0) as revenue, " +
            "           coalesce(cpr.quantity_sold, 0) as quantity_sold, " +
            "           coalesce(cpr.average_price, b.baseline_price, 0) as average_price, " +
            "           coalesce(cpr.transaction_count, 0) as transaction_count, " +
            "           coalesce(cpr.sales_days, 0) as sales_days, " +
            "           ls.last_sold_at, " +
            "           coalesce(cpr.promo_revenue, 0) as promo_revenue, " +
            "           coalesce(cpr.promo_quantity, 0) as promo_quantity, " +
            "           coalesce(cpr.normal_revenue, 0) as normal_revenue, " +
            "           coalesce(cpr.normal_quantity, 0) as normal_quantity, " +
            "           coalesce(cpr.promo_average_price, 0) as promo_average_price, " +
            "           coalesce(cpr.normal_average_price, 0) as normal_average_price, " +
            "           coalesce(cpr.price_index, 1) as price_index, " +
            "           coalesce(cpr.baseline_price, b.baseline_price, 0) as baseline_price, " +
            "           round((coalesce(cpr.quantity_sold, 0) / nullif(greatest(coalesce(cpr.sales_days, 0), 1), 0))::numeric, 3) as sales_velocity, " +
            "           round(case when coalesce(cpr.revenue, 0) > 0 then (coalesce(cpr.promo_revenue, 0) / cpr.revenue) else 0 end, 4) as promo_revenue_share, " +
            "           round(case when pp.previous_revenue > 0 then (((coalesce(cpr.revenue, 0) - pp.previous_revenue) / pp.previous_revenue) * 100) else 0 end, 2) as revenue_trend_percentage, " +
            "           case " +
            "             when (coalesce(cpr.quantity_sold, 0) / nullif(greatest(coalesce(cpr.sales_days, 0), 1), 0)) >= 12 then 'HIGH' " +
            "             when (coalesce(cpr.quantity_sold, 0) / nullif(greatest(coalesce(cpr.sales_days, 0), 1), 0)) >= 4 then 'MEDIUM' " +
            "             else 'LOW' " +
            "           end as turnover_band " +
            "    from market_products mp " +
            "    left join current_period_raw cpr on cpr.product_id = mp.id " +
            "    left join previous_period pp on pp.product_id = mp.id " +
            "    left join baseline b on b.product_id = mp.id " +
            "    left join last_sales ls on ls.product_id = mp.id" +
            ") ";
    }

    private String resolveSort(String sortBy) {
        String normalized = sortBy == null ? "REVENUE" : sortBy.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "QUANTITY" -> "cp.quantity_sold desc, cp.revenue desc, cp.name asc";
            case "TRANSACTIONS" -> "cp.transaction_count desc, cp.revenue desc, cp.name asc";
            case "PRICE" -> "cp.average_price desc nulls last, cp.revenue desc, cp.name asc";
            case "TURNOVER" -> "cp.sales_velocity desc, cp.revenue desc, cp.name asc";
            case "TURNOVER_ASC" -> "cp.sales_velocity asc, cp.revenue asc, cp.name asc";
            case "TREND" -> "cp.revenue_trend_percentage desc nulls last, cp.revenue desc, cp.name asc";
            case "TREND_ASC" -> "cp.revenue_trend_percentage asc nulls first, cp.sales_velocity asc, cp.name asc";
            case "PROMO" -> "cp.promo_revenue_share desc, cp.promo_revenue desc, cp.name asc";
            case "NAME" -> "cp.name asc";
            default -> "cp.revenue desc, cp.quantity_sold desc, cp.name asc";
        };
    }

    private ProductPerformanceDTO mapProductPerformance(ResultSet rs) throws SQLException {
        return new ProductPerformanceDTO(
            uuid(rs, "product_id"),
            rs.getString("ean"),
            rs.getString("name"),
            rs.getString("category"),
            defaultBigDecimal(rs.getBigDecimal("revenue")),
            defaultBigDecimal(rs.getBigDecimal("quantity_sold")),
            defaultBigDecimal(rs.getBigDecimal("average_price")),
            rs.getLong("transaction_count"),
            rs.getInt("sales_days"),
            defaultBigDecimal(rs.getBigDecimal("sales_velocity")),
            defaultBigDecimal(rs.getBigDecimal("promo_revenue")),
            defaultBigDecimal(rs.getBigDecimal("promo_quantity")),
            defaultBigDecimal(rs.getBigDecimal("normal_revenue")),
            defaultBigDecimal(rs.getBigDecimal("normal_quantity")),
            defaultBigDecimal(rs.getBigDecimal("baseline_price")),
            defaultBigDecimal(rs.getBigDecimal("promo_average_price")),
            defaultBigDecimal(rs.getBigDecimal("normal_average_price")),
            defaultBigDecimal(rs.getBigDecimal("promo_revenue_share")),
            defaultBigDecimal(rs.getBigDecimal("price_index")),
            rs.getObject("revenue_trend_percentage") != null ? rs.getDouble("revenue_trend_percentage") : null,
            localDateTime(rs, "last_sold_at"),
            rs.getString("turnover_band")
        );
    }

    private RowMapper<ProductPerformanceDTO> productPerformanceRowMapper() {
        return (rs, rowNum) -> mapProductPerformance(rs);
    }

    private SeasonalityPointDTO mapSeasonality(SeasonalityGranularity granularity, ResultSet rs) throws SQLException {
        int bucket = rs.getInt("bucket");
        return new SeasonalityPointDTO(
            String.valueOf(bucket),
            labelFor(granularity, bucket),
            defaultBigDecimal(rs.getBigDecimal("revenue")),
            defaultBigDecimal(rs.getBigDecimal("quantity")),
            rs.getLong("transactions"),
            defaultBigDecimal(rs.getBigDecimal("average_ticket"))
        );
    }

    private String labelFor(SeasonalityGranularity granularity, int bucket) {
        return switch (granularity) {
            case WEEKDAY -> switch (bucket) {
                case 0 -> "Dom";
                case 1 -> "Seg";
                case 2 -> "Ter";
                case 3 -> "Qua";
                case 4 -> "Qui";
                case 5 -> "Sex";
                default -> "Sab";
            };
            case HOUR -> String.format("%02dh", bucket);
            case MONTH -> Month.of(bucket).name().substring(0, 3);
        };
    }

    private AlertDTO mapAlert(Alert alert) {
        return new AlertDTO(
            alert.getId(),
            alert.getType() != null ? alert.getType().name() : null,
            alert.getTitle(),
            alert.getMessage(),
            alert.getPriority() != null ? alert.getPriority().name() : null,
            alert.getProduct() != null ? alert.getProduct().getId() : null,
            alert.getIsRead(),
            alert.getCreatedAt()
        );
    }

    private BigDecimal defaultBigDecimal(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    }

    private UUID uuid(ResultSet rs, String column) throws SQLException {
        Object value = rs.getObject(column);
        if (value == null) {
            return null;
        }
        return value instanceof UUID uuid ? uuid : UUID.fromString(value.toString());
    }

    private LocalDateTime localDateTime(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp != null ? timestamp.toLocalDateTime() : null;
    }

    private double calculateGrowth(BigDecimal current, BigDecimal previous) {
        if (previous == null || previous.compareTo(BigDecimal.ZERO) == 0) {
            return current != null && current.compareTo(BigDecimal.ZERO) > 0 ? 100.0 : 0.0;
        }
        return current.subtract(previous)
            .divide(previous, 4, RoundingMode.HALF_UP)
            .multiply(BigDecimal.valueOf(100))
            .doubleValue();
    }

    private double calculateLift(BigDecimal promo, BigDecimal normal) {
        if (normal == null || normal.compareTo(BigDecimal.ZERO) == 0) {
            return promo != null && promo.compareTo(BigDecimal.ZERO) > 0 ? 100.0 : 0.0;
        }
        return promo.subtract(normal)
            .divide(normal, 4, RoundingMode.HALF_UP)
            .multiply(BigDecimal.valueOf(100))
            .doubleValue();
    }

    private Window resolveWindow(LocalDate startDate, LocalDate endDate, int defaultDays) {
        LocalDate resolvedEnd = endDate != null ? endDate : LocalDate.now();
        LocalDate resolvedStart = startDate != null ? startDate : resolvedEnd.minusDays(defaultDays - 1L);
        if (resolvedStart.isAfter(resolvedEnd)) {
            resolvedStart = resolvedEnd.minusDays(defaultDays - 1L);
        }
        return new Window(resolvedStart, resolvedEnd);
    }

    private record Window(LocalDate start, LocalDate end) {
        long lengthDays() {
            return ChronoUnit.DAYS.between(start, end) + 1;
        }
    }

    private record Overview(
        BigDecimal totalRevenue,
        BigDecimal averageTicket,
        long totalTransactions,
        int activeProducts,
        double growthPercentage,
        BigDecimal promoRevenueShare
    ) {
    }

    private record Aggregate(BigDecimal revenue, long transactions, BigDecimal averageTicket) {
    }

    private enum SeasonalityGranularity {
        WEEKDAY,
        HOUR,
        MONTH
    }
}
