package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.AlertDTO;
import com.pdv2cloud.model.dto.CampaignImpactDTO;
import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.dto.MarketCockpitDTO;
import com.pdv2cloud.model.dto.ProductPairInsightDTO;
import com.pdv2cloud.model.dto.ProductPerformanceDTO;
import com.pdv2cloud.model.dto.PromotionImpactDTO;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Month;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
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
        List<ProductPerformanceDTO> performance = loadProductPerformanceRows(marketId, window, null);

        MarketCockpitDTO cockpit = new MarketCockpitDTO();
        Overview overview = buildOverview(marketId, window, performance);
        cockpit.setTotalRevenue(overview.totalRevenue());
        cockpit.setAverageTicket(overview.averageTicket());
        cockpit.setTotalTransactions(overview.totalTransactions());
        cockpit.setActiveProducts(overview.activeProducts());
        cockpit.setGrowthPercentage(overview.growthPercentage());
        cockpit.setPromoRevenueShare(overview.promoRevenueShare());
        cockpit.setCampaignsRunning(countRunningCampaigns(marketId));
        cockpit.setTopProducts(topProducts(performance, "REVENUE", 5));
        cockpit.setSlowMovers(topProducts(performance, "TREND_ASC", 5));
        cockpit.setTopTurnoverProducts(topProducts(performance, "TURNOVER", 5));
        cockpit.setLowTurnoverProducts(topProducts(performance, "TURNOVER_ASC", 5));
        cockpit.setPromotionHighlights(fetchPromotionHighlights(performance, 6));
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
        List<ProductPerformanceDTO> rows = sortProducts(loadProductPerformanceRows(marketId, window, category), sortBy);
        int fromIndex = Math.min((int) pageable.getOffset(), rows.size());
        int toIndex = Math.min(fromIndex + pageable.getPageSize(), rows.size());
        return new PageImpl<>(rows.subList(fromIndex, toIndex), pageable, rows.size());
    }

    public List<CampaignImpactDTO> getCampaignImpacts(UUID marketId) {
        return fetchCampaignImpacts(marketId);
    }

    public List<SeasonalityPointDTO> getWeekdaySeasonality(UUID marketId, LocalDate startDate, LocalDate endDate) {
        return fetchSeasonality(marketId, resolveWindow(startDate, endDate, 90), SeasonalityGranularity.WEEKDAY);
    }

    private List<ProductPerformanceDTO> loadProductPerformanceRows(UUID marketId, Window window, String category) {
        MapSqlParameterSource params = baseProductParams(marketId, window, category);
        Map<UUID, ProductSnapshot> products = loadMarketProducts(params);
        Map<UUID, BigDecimal> baselinePrices = loadBaselinePrices(params);
        Map<UUID, BigDecimal> previousRevenues = loadPreviousRevenues(params);
        Map<UUID, LocalDateTime> lastSales = loadLastSales(params);
        Map<UUID, CurrentAggregate> currentAggregates = loadCurrentAggregates(params);

        List<ProductPerformanceDTO> rows = new ArrayList<>();
        for (ProductSnapshot product : products.values()) {
            CurrentAggregate current = currentAggregates.get(product.productId());
            BigDecimal revenue = current != null ? current.revenue() : zero(2);
            BigDecimal quantitySold = current != null ? current.quantitySold() : zero(3);
            BigDecimal averagePrice = current != null ? current.averagePrice() : zero(2);
            Long transactionCount = current != null ? current.transactionCount() : 0L;
            Integer salesDays = current != null ? current.salesDays() : 0;
            BigDecimal promoRevenue = current != null ? current.promoRevenue() : zero(2);
            BigDecimal promoQuantity = current != null ? current.promoQuantity() : zero(3);
            BigDecimal normalRevenue = current != null ? current.normalRevenue() : zero(2);
            BigDecimal normalQuantity = current != null ? current.normalQuantity() : zero(3);
            BigDecimal promoAveragePrice = current != null ? current.promoAveragePrice() : zero(2);
            BigDecimal normalAveragePrice = current != null ? current.normalAveragePrice() : zero(2);
            BigDecimal baselinePrice = defaultBigDecimal(baselinePrices.get(product.productId()));
            if (baselinePrice.compareTo(BigDecimal.ZERO) == 0) {
                baselinePrice = averagePrice;
            }

            BigDecimal salesVelocity = salesDays > 0
                ? quantitySold.divide(BigDecimal.valueOf(salesDays), 3, RoundingMode.HALF_UP)
                : quantitySold.compareTo(BigDecimal.ZERO) > 0
                    ? quantitySold.setScale(3, RoundingMode.HALF_UP)
                    : zero(3);

            BigDecimal promoRevenueShare = revenue.compareTo(BigDecimal.ZERO) > 0
                ? promoRevenue.divide(revenue, 4, RoundingMode.HALF_UP)
                : zero(4);

            BigDecimal priceIndex = baselinePrice.compareTo(BigDecimal.ZERO) > 0
                ? averagePrice.divide(baselinePrice, 4, RoundingMode.HALF_UP)
                : BigDecimal.ONE.setScale(4, RoundingMode.HALF_UP);

            rows.add(new ProductPerformanceDTO(
                product.productId(),
                product.ean(),
                product.name(),
                product.category(),
                revenue,
                quantitySold,
                averagePrice,
                transactionCount,
                salesDays,
                salesVelocity,
                promoRevenue,
                promoQuantity,
                normalRevenue,
                normalQuantity,
                baselinePrice,
                promoAveragePrice,
                normalAveragePrice,
                promoRevenueShare,
                priceIndex,
                calculateGrowth(revenue, previousRevenues.get(product.productId())),
                lastSales.get(product.productId()),
                resolveTurnoverBand(salesVelocity)
            ));
        }
        return rows;
    }

    private Map<UUID, ProductSnapshot> loadMarketProducts(MapSqlParameterSource params) {
        return jdbcTemplate.query(
            "select distinct p.id as product_id, p.ean, p.name, p.category " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "join products p on p.id = it.product_id " +
            "where i.market_id = :marketId and (:category is null or p.category = :category) " +
            "order by p.name asc",
            params,
            rs -> {
                Map<UUID, ProductSnapshot> rows = new LinkedHashMap<>();
                while (rs.next()) {
                    UUID productId = uuid(rs, "product_id");
                    rows.put(productId, new ProductSnapshot(
                        productId,
                        rs.getString("ean"),
                        rs.getString("name"),
                        rs.getString("category")
                    ));
                }
                return rows;
            }
        );
    }

    private Map<UUID, BigDecimal> loadBaselinePrices(MapSqlParameterSource params) {
        return jdbcTemplate.query(
            "select it.product_id, avg(it.valor_unitario) as baseline_price " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "where i.market_id = :marketId and i.data_emissao >= :baselineStart and i.data_emissao < :endExclusive " +
            "group by it.product_id",
            params,
            (ResultSet rs) -> mapBigDecimalByUuid(rs, "product_id", "baseline_price")
        );
    }

    private Map<UUID, BigDecimal> loadPreviousRevenues(MapSqlParameterSource params) {
        return jdbcTemplate.query(
            "select it.product_id, coalesce(sum(it.valor_total), 0) as previous_revenue " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "join products p on p.id = it.product_id " +
            "where i.market_id = :marketId and i.data_emissao >= :previousStart and i.data_emissao < :startDate " +
            "  and (:category is null or p.category = :category) " +
            "group by it.product_id",
            params,
            (ResultSet rs) -> mapBigDecimalByUuid(rs, "product_id", "previous_revenue")
        );
    }

    private Map<UUID, LocalDateTime> loadLastSales(MapSqlParameterSource params) {
        return jdbcTemplate.query(
            "select it.product_id, max(i.data_emissao) as last_sold_at " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "join products p on p.id = it.product_id " +
            "where i.market_id = :marketId and (:category is null or p.category = :category) " +
            "group by it.product_id",
            params,
            rs -> {
                Map<UUID, LocalDateTime> rows = new LinkedHashMap<>();
                while (rs.next()) {
                    rows.put(uuid(rs, "product_id"), localDateTime(rs, "last_sold_at"));
                }
                return rows;
            }
        );
    }

    private Map<UUID, CurrentAggregate> loadCurrentAggregates(MapSqlParameterSource params) {
        String baselineSubquery =
            "select it2.product_id, avg(it2.valor_unitario) as baseline_price " +
            "from invoice_items it2 " +
            "join invoices i2 on i2.id = it2.invoice_id " +
            "where i2.market_id = :marketId and i2.data_emissao >= :baselineStart and i2.data_emissao < :endExclusive " +
            "group by it2.product_id";

        return jdbcTemplate.query(
            "select p.id as product_id, " +
            "       coalesce(sum(it.valor_total), 0) as revenue, " +
            "       coalesce(sum(it.quantidade), 0) as quantity_sold, " +
            "       coalesce(avg(it.valor_unitario), 0) as average_price, " +
            "       count(distinct i.id) as transaction_count, " +
            "       count(distinct cast(i.data_emissao as date)) as sales_days, " +
            "       coalesce(sum(case when it.valor_unitario <= coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_total else 0 end), 0) as promo_revenue, " +
            "       coalesce(sum(case when it.valor_unitario <= coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.quantidade else 0 end), 0) as promo_quantity, " +
            "       coalesce(sum(case when it.valor_unitario > coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_total else 0 end), 0) as normal_revenue, " +
            "       coalesce(sum(case when it.valor_unitario > coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.quantidade else 0 end), 0) as normal_quantity, " +
            "       coalesce(avg(case when it.valor_unitario <= coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_unitario end), 0) as promo_average_price, " +
            "       coalesce(avg(case when it.valor_unitario > coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_unitario end), 0) as normal_average_price " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "join products p on p.id = it.product_id " +
            "left join (" + baselineSubquery + ") b on b.product_id = p.id " +
            "where i.market_id = :marketId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive " +
            "  and (:category is null or p.category = :category) " +
            "group by p.id",
            params,
            rs -> {
                Map<UUID, CurrentAggregate> rows = new LinkedHashMap<>();
                while (rs.next()) {
                    rows.put(uuid(rs, "product_id"), new CurrentAggregate(
                        defaultBigDecimal(rs.getBigDecimal("revenue")),
                        defaultBigDecimal(rs.getBigDecimal("quantity_sold")),
                        defaultBigDecimal(rs.getBigDecimal("average_price")),
                        rs.getLong("transaction_count"),
                        rs.getInt("sales_days"),
                        defaultBigDecimal(rs.getBigDecimal("promo_revenue")),
                        defaultBigDecimal(rs.getBigDecimal("promo_quantity")),
                        defaultBigDecimal(rs.getBigDecimal("normal_revenue")),
                        defaultBigDecimal(rs.getBigDecimal("normal_quantity")),
                        defaultBigDecimal(rs.getBigDecimal("promo_average_price")),
                        defaultBigDecimal(rs.getBigDecimal("normal_average_price"))
                    ));
                }
                return rows;
            }
        );
    }

    private Overview buildOverview(UUID marketId, Window window, List<ProductPerformanceDTO> performance) {
        MapSqlParameterSource params = baseProductParams(marketId, window, null);
        BigDecimal totalRevenue = performance.stream()
            .map(ProductPerformanceDTO::getRevenue)
            .map(this::defaultBigDecimal)
            .reduce(zero(2), BigDecimal::add);
        BigDecimal promoRevenue = performance.stream()
            .map(ProductPerformanceDTO::getPromoRevenue)
            .map(this::defaultBigDecimal)
            .reduce(zero(2), BigDecimal::add);
        long activeProducts = performance.stream()
            .filter(row -> defaultBigDecimal(row.getRevenue()).compareTo(BigDecimal.ZERO) > 0)
            .count();
        Long totalTransactions = jdbcTemplate.queryForObject(
            "select count(*) from invoices i " +
            "where i.market_id = :marketId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive",
            params,
            Long.class
        );
        BigDecimal previousRevenue = jdbcTemplate.queryForObject(
            "select coalesce(sum(i.valor_total), 0) from invoices i " +
            "where i.market_id = :marketId and i.data_emissao >= :previousStart and i.data_emissao < :startDate",
            params,
            BigDecimal.class
        );

        long transactions = totalTransactions != null ? totalTransactions : 0L;
        BigDecimal averageTicket = transactions > 0
            ? totalRevenue.divide(BigDecimal.valueOf(transactions), 2, RoundingMode.HALF_UP)
            : zero(2);
        BigDecimal promoRevenueShare = totalRevenue.compareTo(BigDecimal.ZERO) > 0
            ? promoRevenue.divide(totalRevenue, 4, RoundingMode.HALF_UP)
            : zero(4);

        return new Overview(
            totalRevenue,
            averageTicket,
            transactions,
            (int) activeProducts,
            calculateGrowth(totalRevenue, previousRevenue),
            promoRevenueShare
        );
    }

    private List<ProductPerformanceDTO> topProducts(List<ProductPerformanceDTO> performance, String sortBy, int limit) {
        return sortProducts(performance, sortBy).stream().limit(limit).toList();
    }

    private List<ProductPerformanceDTO> sortProducts(List<ProductPerformanceDTO> performance, String sortBy) {
        List<ProductPerformanceDTO> sorted = new ArrayList<>(performance);
        sorted.sort(resolveComparator(sortBy));
        return sorted;
    }

    private Comparator<ProductPerformanceDTO> resolveComparator(String sortBy) {
        String normalized = sortBy == null ? "REVENUE" : sortBy.trim().toUpperCase(Locale.ROOT);
        Comparator<ProductPerformanceDTO> byName = Comparator.comparing(
            row -> row.getName() == null ? "" : row.getName(),
            String.CASE_INSENSITIVE_ORDER
        );
        Comparator<ProductPerformanceDTO> byRevenueDesc = Comparator
            .comparing((ProductPerformanceDTO row) -> defaultBigDecimal(row.getRevenue()))
            .reversed();
        Comparator<ProductPerformanceDTO> byRevenueAsc = Comparator.comparing(row -> defaultBigDecimal(row.getRevenue()));
        Comparator<ProductPerformanceDTO> byQuantityDesc = Comparator
            .comparing((ProductPerformanceDTO row) -> defaultBigDecimal(row.getQuantitySold()))
            .reversed();
        Comparator<ProductPerformanceDTO> byTransactionDesc = Comparator
            .comparingLong((ProductPerformanceDTO row) -> row.getTransactionCount() != null ? row.getTransactionCount() : 0L)
            .reversed();
        Comparator<ProductPerformanceDTO> byAveragePriceDesc = Comparator
            .comparing((ProductPerformanceDTO row) -> defaultBigDecimal(row.getAveragePrice()))
            .reversed();
        Comparator<ProductPerformanceDTO> byVelocityDesc = Comparator
            .comparing((ProductPerformanceDTO row) -> defaultBigDecimal(row.getSalesVelocity()))
            .reversed();
        Comparator<ProductPerformanceDTO> byVelocityAsc = Comparator.comparing(row -> defaultBigDecimal(row.getSalesVelocity()));
        Comparator<ProductPerformanceDTO> byPromoDesc = Comparator
            .comparing((ProductPerformanceDTO row) -> defaultBigDecimal(row.getPromoRevenueShare()))
            .reversed();
        Comparator<ProductPerformanceDTO> byTrendDesc = Comparator
            .comparingDouble((ProductPerformanceDTO row) -> row.getRevenueTrendPercentage() != null ? row.getRevenueTrendPercentage() : -Double.MAX_VALUE)
            .reversed();
        Comparator<ProductPerformanceDTO> byTrendAsc = Comparator
            .comparingDouble((ProductPerformanceDTO row) -> row.getRevenueTrendPercentage() != null ? row.getRevenueTrendPercentage() : -Double.MAX_VALUE);

        return switch (normalized) {
            case "QUANTITY" -> byQuantityDesc.thenComparing(byRevenueDesc).thenComparing(byName);
            case "TRANSACTIONS" -> byTransactionDesc.thenComparing(byRevenueDesc).thenComparing(byName);
            case "PRICE" -> byAveragePriceDesc.thenComparing(byRevenueDesc).thenComparing(byName);
            case "TURNOVER" -> byVelocityDesc.thenComparing(byRevenueDesc).thenComparing(byName);
            case "TURNOVER_ASC" -> byVelocityAsc.thenComparing(byRevenueAsc).thenComparing(byName);
            case "TREND" -> byTrendDesc.thenComparing(byRevenueDesc).thenComparing(byName);
            case "TREND_ASC" -> byTrendAsc.thenComparing(byVelocityAsc).thenComparing(byName);
            case "PROMO" -> byPromoDesc.thenComparing(byRevenueDesc).thenComparing(byName);
            case "NAME" -> byName;
            default -> byRevenueDesc.thenComparing(byQuantityDesc).thenComparing(byName);
        };
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

    private List<PromotionImpactDTO> fetchPromotionHighlights(List<ProductPerformanceDTO> performance, int limit) {
        return sortProducts(performance, "PROMO").stream()
            .filter(row -> defaultBigDecimal(row.getPromoRevenue()).compareTo(BigDecimal.ZERO) > 0
                || defaultBigDecimal(row.getPromoQuantity()).compareTo(BigDecimal.ZERO) > 0)
            .limit(limit)
            .map(row -> new PromotionImpactDTO(
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
                calculateLift(defaultBigDecimal(row.getPromoQuantity()), defaultBigDecimal(row.getNormalQuantity())),
                calculateLift(defaultBigDecimal(row.getPromoRevenue()), defaultBigDecimal(row.getNormalRevenue()))
            ))
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
            "select cast(i.data_emissao as date) as sale_date, coalesce(sum(i.valor_total), 0) as revenue " +
            "from invoices i where i.market_id = :marketId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive " +
            "group by cast(i.data_emissao as date) order by sale_date",
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

    private Map<UUID, BigDecimal> mapBigDecimalByUuid(ResultSet rs, String idColumn, String valueColumn) throws SQLException {
        Map<UUID, BigDecimal> rows = new LinkedHashMap<>();
        while (rs.next()) {
            rows.put(uuid(rs, idColumn), defaultBigDecimal(rs.getBigDecimal(valueColumn)));
        }
        return rows;
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
        return value != null ? value : zero(2);
    }

    private BigDecimal zero(int scale) {
        return BigDecimal.ZERO.setScale(scale, RoundingMode.HALF_UP);
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

    private String resolveTurnoverBand(BigDecimal salesVelocity) {
        if (salesVelocity.compareTo(BigDecimal.valueOf(12)) >= 0) {
            return "HIGH";
        }
        if (salesVelocity.compareTo(BigDecimal.valueOf(4)) >= 0) {
            return "MEDIUM";
        }
        return "LOW";
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

    private record ProductSnapshot(UUID productId, String ean, String name, String category) {
    }

    private record CurrentAggregate(
        BigDecimal revenue,
        BigDecimal quantitySold,
        BigDecimal averagePrice,
        Long transactionCount,
        Integer salesDays,
        BigDecimal promoRevenue,
        BigDecimal promoQuantity,
        BigDecimal normalRevenue,
        BigDecimal normalQuantity,
        BigDecimal promoAveragePrice,
        BigDecimal normalAveragePrice
    ) {
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
