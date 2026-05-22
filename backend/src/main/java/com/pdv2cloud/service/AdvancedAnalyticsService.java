package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.AlertDTO;
import com.pdv2cloud.model.dto.CampaignImpactDTO;
import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.dto.MarketCockpitDTO;
import com.pdv2cloud.model.dto.ProductPairInsightDTO;
import com.pdv2cloud.model.dto.ProductBranchPerformanceDTO;
import com.pdv2cloud.model.dto.ProductDashboardDTO;
import com.pdv2cloud.model.dto.ProductPerformanceDTO;
import com.pdv2cloud.model.dto.ProductPurchaseSignalDTO;
import com.pdv2cloud.model.dto.ProductSeasonalPerformanceDTO;
import com.pdv2cloud.model.dto.PromotionImpactDTO;
import com.pdv2cloud.model.dto.SalesTrendPointDTO;
import com.pdv2cloud.model.dto.SeasonalProductCollectionDTO;
import com.pdv2cloud.model.dto.SeasonalityPointDTO;
import com.pdv2cloud.model.entity.Alert;
import com.pdv2cloud.model.entity.Campaign;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.AlertRepository;
import com.pdv2cloud.repository.CampaignRepository;
import com.pdv2cloud.repository.InvoiceRepository;
import com.pdv2cloud.repository.ProductRepository;
import java.text.NumberFormat;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
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

    @Autowired
    private PriceIntelligenceService priceIntelligenceService;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CatalogImageStorageService catalogImageStorageService;

    public MarketCockpitDTO getCockpit(UUID marketId, LocalDate startDate, LocalDate endDate) {
        Window window = resolveWindow(startDate, endDate, 90);
        List<ProductPerformanceDTO> performance = loadProductPerformanceRows(marketId, window, null, null, null);

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
        cockpit.setReplenishmentCandidates(fetchReplenishmentCandidates(performance, 8));
        cockpit.setPromotionCandidates(fetchPromotionCandidates(performance, 8));
        cockpit.setPromotionHighlights(fetchPromotionHighlights(performance, 6));
        cockpit.setWeekdaySeasonality(fetchSeasonality(marketId, window, SeasonalityGranularity.WEEKDAY));
        cockpit.setHourlySeasonality(fetchSeasonality(marketId, window, SeasonalityGranularity.HOUR));
        cockpit.setMonthlySeasonality(fetchSeasonality(marketId, window, SeasonalityGranularity.MONTH));
        cockpit.setTopPairs(fetchBasketHighlights(marketId, 8));
        cockpit.setSeasonalCollections(fetchSeasonalCollections(marketId, window.end()));
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
        String search,
        String sortBy,
        Pageable pageable
    ) {
        Window window = resolveWindow(startDate, endDate, 90);
        MapSqlParameterSource params = baseProductParams(marketId, window, category, search, null);
        long total = countMarketProducts(params);
        if (total == 0) {
            return new PageImpl<>(List.of(), pageable, 0);
        }

        List<ProductPerformanceDTO> rows = loadProductPerformancePage(params, sortBy, pageable);
        return new PageImpl<>(rows, pageable, total);
    }

    public ProductDashboardDTO getProductDashboard(UUID marketId, UUID productId, LocalDate startDate, LocalDate endDate) {
        Window window = resolveWindow(startDate, endDate, 90);
        ProductPerformanceDTO overview = loadProductPerformanceRows(marketId, window, null, null, productId).stream()
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Product not found for market"));

        ProductDashboardDTO dashboard = new ProductDashboardDTO();
        dashboard.setOverview(overview);
        dashboard.setSalesTrend(fetchProductSalesTrend(marketId, productId, window));
        dashboard.setWeekdaySeasonality(fetchProductWeekdaySeasonality(marketId, productId, window));
        dashboard.setBranchPerformance(fetchProductBranchPerformance(marketId, productId, window));
        dashboard.setRelatedPairs(fetchProductRelatedPairs(marketId, productId, 6));
        dashboard.setPriceTimeline(priceIntelligenceService.getProductPriceTimeline(marketId, productId, window.start(), window.end()));
        dashboard.setPriceEvents(priceIntelligenceService.getProductPriceEvents(marketId, productId, window.start(), window.end()));
        dashboard.setPromotionWindows(priceIntelligenceService.getProductPromotionWindows(marketId, productId, window.start(), window.end()));
        List<ProductSeasonalPerformanceDTO> seasonal = fetchProductSeasonalPerformance(marketId, productId, window.end());
        dashboard.setSeasonalPerformance(seasonal);
        dashboard.setPurchaseSignal(buildPurchaseSignal(overview, seasonal, window.end()));
        return dashboard;
    }

    public List<CampaignImpactDTO> getCampaignImpacts(UUID marketId) {
        return fetchCampaignImpacts(marketId);
    }

    public List<SeasonalityPointDTO> getWeekdaySeasonality(UUID marketId, LocalDate startDate, LocalDate endDate) {
        return fetchSeasonality(marketId, resolveWindow(startDate, endDate, 90), SeasonalityGranularity.WEEKDAY);
    }

    private long countMarketProducts(MapSqlParameterSource params) {
        StringBuilder sql = new StringBuilder(
            "select count(*) from (" +
            "select distinct p.id " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "join products p on p.id = it.product_id " +
            "where i.market_id = :marketId "
        );
        appendProductFilters(sql, params, "p");
        sql.append(") mp");
        Long total = jdbcTemplate.queryForObject(sql.toString(), params, Long.class);
        return total != null ? total : 0L;
    }

    private List<ProductPerformanceDTO> loadProductPerformancePage(
        MapSqlParameterSource params,
        String sortBy,
        Pageable pageable
    ) {
        params.addValue("limit", pageable.getPageSize(), Types.INTEGER);
        params.addValue("offset", pageable.getOffset(), Types.BIGINT);

        String orderBy = buildPerformanceOrderByClause(sortBy);
        StringBuilder sql = new StringBuilder(
            "with market_products as ( " +
            "   select distinct p.id as product_id, p.ean, p.name, p.category, p.image_url " +
            "   from invoice_items it " +
            "   join invoices i on i.id = it.invoice_id " +
            "   join products p on p.id = it.product_id " +
            "   where i.market_id = :marketId "
        );
        appendProductFilters(sql, params, "p");
        sql.append("), ");
        sql.append(
            "baseline as ( " +
            "   select it.product_id, avg(it.valor_unitario) as baseline_price " +
            "   from invoice_items it " +
            "   join invoices i on i.id = it.invoice_id " +
            "   join market_products mp on mp.product_id = it.product_id " +
            "   where i.market_id = :marketId and i.data_emissao >= :baselineStart and i.data_emissao < :endExclusive " +
            "   group by it.product_id " +
            "), " +
            "current_period as ( " +
            "   select it.product_id, " +
            "          coalesce(sum(it.valor_total), 0) as revenue, " +
            "          coalesce(sum(it.quantidade), 0) as quantity_sold, " +
            "          coalesce(avg(it.valor_unitario), 0) as average_price, " +
            "          count(distinct i.id) as transaction_count, " +
            "          count(distinct cast(i.data_emissao as date)) as sales_days, " +
            "          coalesce(sum(case when it.valor_unitario <= coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_total else 0 end), 0) as promo_revenue, " +
            "          coalesce(sum(case when it.valor_unitario <= coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.quantidade else 0 end), 0) as promo_quantity, " +
            "          coalesce(sum(case when it.valor_unitario > coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_total else 0 end), 0) as normal_revenue, " +
            "          coalesce(sum(case when it.valor_unitario > coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.quantidade else 0 end), 0) as normal_quantity, " +
            "          coalesce(avg(case when it.valor_unitario <= coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_unitario end), 0) as promo_average_price, " +
            "          coalesce(avg(case when it.valor_unitario > coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_unitario end), 0) as normal_average_price, " +
            "          max(i.data_emissao) as last_sold_at " +
            "   from invoice_items it " +
            "   join invoices i on i.id = it.invoice_id " +
            "   join market_products mp on mp.product_id = it.product_id " +
            "   left join baseline b on b.product_id = it.product_id " +
            "   where i.market_id = :marketId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive " +
            "   group by it.product_id " +
            "), " +
            "previous_period as ( " +
            "   select it.product_id, coalesce(sum(it.valor_total), 0) as previous_revenue " +
            "   from invoice_items it " +
            "   join invoices i on i.id = it.invoice_id " +
            "   join market_products mp on mp.product_id = it.product_id " +
            "   where i.market_id = :marketId and i.data_emissao >= :previousStart and i.data_emissao < :startDate " +
            "   group by it.product_id " +
            ") " +
            "select mp.product_id, mp.ean, mp.name, mp.category, mp.image_url, " +
            "       coalesce(cp.revenue, 0) as revenue, " +
            "       coalesce(cp.quantity_sold, 0) as quantity_sold, " +
            "       coalesce(cp.average_price, 0) as average_price, " +
            "       coalesce(cp.transaction_count, 0) as transaction_count, " +
            "       coalesce(cp.sales_days, 0) as sales_days, " +
            "       case " +
            "           when coalesce(cp.sales_days, 0) > 0 then round(coalesce(cp.quantity_sold, 0) / cp.sales_days, 3) " +
            "           when coalesce(cp.quantity_sold, 0) > 0 then round(coalesce(cp.quantity_sold, 0), 3) " +
            "           else 0 " +
            "       end as sales_velocity, " +
            "       coalesce(cp.promo_revenue, 0) as promo_revenue, " +
            "       coalesce(cp.promo_quantity, 0) as promo_quantity, " +
            "       coalesce(cp.normal_revenue, 0) as normal_revenue, " +
            "       coalesce(cp.normal_quantity, 0) as normal_quantity, " +
            "       coalesce(b.baseline_price, cp.average_price, 0) as baseline_price, " +
            "       coalesce(cp.promo_average_price, 0) as promo_average_price, " +
            "       coalesce(cp.normal_average_price, 0) as normal_average_price, " +
            "       case when coalesce(cp.revenue, 0) > 0 then round(coalesce(cp.promo_revenue, 0) / cp.revenue, 4) else 0 end as promo_revenue_share, " +
            "       case when coalesce(b.baseline_price, 0) > 0 then round(coalesce(cp.average_price, 0) / b.baseline_price, 4) else 1 end as price_index, " +
            "       case " +
            "           when coalesce(pp.previous_revenue, 0) > 0 then round(((coalesce(cp.revenue, 0) - pp.previous_revenue) / pp.previous_revenue) * 100, 2) " +
            "           when coalesce(cp.revenue, 0) > 0 then 100 " +
            "           else 0 " +
            "       end as revenue_trend_percentage, " +
            "       cp.last_sold_at, " +
            "       case " +
            "           when (case when coalesce(cp.sales_days, 0) > 0 then coalesce(cp.quantity_sold, 0) / cp.sales_days else coalesce(cp.quantity_sold, 0) end) >= 12 then 'HIGH' " +
            "           when (case when coalesce(cp.sales_days, 0) > 0 then coalesce(cp.quantity_sold, 0) / cp.sales_days else coalesce(cp.quantity_sold, 0) end) >= 4 then 'MEDIUM' " +
            "           else 'LOW' " +
            "       end as turnover_band " +
            "from market_products mp " +
            "left join current_period cp on cp.product_id = mp.product_id " +
            "left join previous_period pp on pp.product_id = mp.product_id " +
            "left join baseline b on b.product_id = mp.product_id " +
            "order by " + orderBy + " " +
            "limit :limit offset :offset"
        );

        return jdbcTemplate.query(
            sql.toString(),
            params,
            (rs, rowNum) -> new ProductPerformanceDTO(
                uuid(rs, "product_id"),
                rs.getString("ean"),
                rs.getString("name"),
                rs.getString("category"),
                resolveProductImage(rs.getString("image_url")),
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
                rs.getDouble("revenue_trend_percentage"),
                localDateTime(rs, "last_sold_at"),
                rs.getString("turnover_band"),
                null, // momentumScore — not computed in paginated path for performance
                null  // healthScore
            )
        );
    }

    private String buildPerformanceOrderByClause(String sortBy) {
        String normalized = sortBy == null ? "REVENUE" : sortBy.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "QUANTITY" -> "quantity_sold desc, revenue desc, name asc";
            case "TRANSACTIONS" -> "transaction_count desc, revenue desc, name asc";
            case "PRICE" -> "average_price desc, revenue desc, name asc";
            case "TURNOVER" -> "sales_velocity desc, revenue desc, name asc";
            case "TURNOVER_ASC" -> "sales_velocity asc, revenue asc, name asc";
            case "TREND" -> "revenue_trend_percentage desc, revenue desc, name asc";
            case "TREND_ASC" -> "revenue_trend_percentage asc, sales_velocity asc, name asc";
            case "PROMO" -> "promo_revenue_share desc, revenue desc, name asc";
            case "NAME" -> "name asc";
            default -> "revenue desc, quantity_sold desc, name asc";
        };
    }

    private List<ProductPerformanceDTO> loadProductPerformanceRows(
        UUID marketId,
        Window window,
        String category,
        String search,
        UUID productId
    ) {
        MapSqlParameterSource params = baseProductParams(marketId, window, category, search, productId);
        Map<UUID, ProductSnapshot> products = loadMarketProducts(params);
        Map<UUID, BigDecimal> baselinePrices = loadBaselinePrices(params);
        Map<UUID, BigDecimal> previousRevenues = loadPreviousRevenues(params);
        Map<UUID, LocalDateTime> lastSales = loadLastSales(params);
        Map<UUID, CurrentAggregate> currentAggregates = loadCurrentAggregates(params);
        Map<UUID, double[]> momentumScores = loadMomentumScores(marketId, window, productId);

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

            double trendPct = calculateGrowth(revenue, previousRevenues.get(product.productId()));
            double[] ms = momentumScores.get(product.productId());
            Double momentumScore = ms != null ? ms[0] : null;
            Double healthScore = computeHealthScore(trendPct, salesVelocity, salesDays, window, ms);

            rows.add(new ProductPerformanceDTO(
                product.productId(),
                product.ean(),
                product.name(),
                product.category(),
                product.imageUrl(),
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
                trendPct,
                lastSales.get(product.productId()),
                resolveTurnoverBand(salesVelocity),
                momentumScore,
                healthScore
            ));
        }
        return rows;
    }

    private Map<UUID, ProductSnapshot> loadMarketProducts(MapSqlParameterSource params) {
        StringBuilder sql = new StringBuilder(
            "select distinct p.id as product_id, p.ean, p.name, p.category, p.image_url " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "join products p on p.id = it.product_id " +
            "where i.market_id = :marketId "
        );
        appendProductFilters(sql, params, "p");
        sql.append(" order by p.name asc");

        return jdbcTemplate.query(
            sql.toString(),
            params,
            rs -> {
                Map<UUID, ProductSnapshot> rows = new LinkedHashMap<>();
                while (rs.next()) {
                    UUID productId = uuid(rs, "product_id");
                    rows.put(productId, new ProductSnapshot(
                        productId,
                        rs.getString("ean"),
                        rs.getString("name"),
                        rs.getString("category"),
                        resolveProductImage(rs.getString("image_url"))
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
        StringBuilder sql = new StringBuilder(
            "select it.product_id, coalesce(sum(it.valor_total), 0) as previous_revenue " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "join products p on p.id = it.product_id " +
            "where i.market_id = :marketId and i.data_emissao >= :previousStart and i.data_emissao < :startDate "
        );
        appendProductFilters(sql, params, "p");
        sql.append(" group by it.product_id");

        return jdbcTemplate.query(
            sql.toString(),
            params,
            (ResultSet rs) -> mapBigDecimalByUuid(rs, "product_id", "previous_revenue")
        );
    }

    private Map<UUID, LocalDateTime> loadLastSales(MapSqlParameterSource params) {
        StringBuilder sql = new StringBuilder(
            "select it.product_id, max(i.data_emissao) as last_sold_at " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "join products p on p.id = it.product_id " +
            "where i.market_id = :marketId "
        );
        appendProductFilters(sql, params, "p");
        sql.append(" group by it.product_id");

        return jdbcTemplate.query(
            sql.toString(),
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

        StringBuilder sql = new StringBuilder(
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
            "where i.market_id = :marketId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive "
        );
        appendProductFilters(sql, params, "p");
        sql.append(" group by p.id");

        return jdbcTemplate.query(
            sql.toString(),
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
        MapSqlParameterSource params = baseProductParams(marketId, window, null, null, null);
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

    private List<ProductPerformanceDTO> fetchReplenishmentCandidates(List<ProductPerformanceDTO> performance, int limit) {
        return sortProducts(performance, "TURNOVER").stream()
            .filter(row -> defaultBigDecimal(row.getRevenue()).compareTo(BigDecimal.ZERO) > 0)
            .filter(row -> defaultBigDecimal(row.getSalesVelocity()).compareTo(BigDecimal.valueOf(1)) > 0)
            .limit(limit)
            .toList();
    }

    private List<ProductPerformanceDTO> fetchPromotionCandidates(List<ProductPerformanceDTO> performance, int limit) {
        return performance.stream()
            .filter(row -> defaultBigDecimal(row.getRevenue()).compareTo(BigDecimal.ZERO) > 0)
            .filter(row -> defaultBigDecimal(row.getPromoRevenueShare()).compareTo(BigDecimal.valueOf(0.20)) < 0)
            .sorted(
                Comparator.comparing((ProductPerformanceDTO row) -> defaultBigDecimal(row.getRevenue())).reversed()
                    .thenComparing(row -> defaultBigDecimal(row.getSalesVelocity()), Comparator.reverseOrder())
                    .thenComparing(row -> row.getRevenueTrendPercentage() != null ? row.getRevenueTrendPercentage() : 0.0)
            )
            .limit(limit)
            .toList();
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
        Map<UUID, Product> productsById = loadProductsById(
            rules.stream()
                .flatMap(rule -> java.util.stream.Stream.concat(rule.getAntecedent().stream(), rule.getConsequent().stream()))
                .toList()
        );
        return rules.stream()
            .limit(limit)
            .map(rule -> new ProductPairInsightDTO(
                rule.getAntecedent().isEmpty() ? null : rule.getAntecedent().get(0),
                rule.getConsequent().isEmpty() ? null : rule.getConsequent().get(0),
                rule.getAntecedentNames() == null || rule.getAntecedentNames().isEmpty() ? null : rule.getAntecedentNames().get(0),
                rule.getConsequentNames() == null || rule.getConsequentNames().isEmpty() ? null : rule.getConsequentNames().get(0),
                resolveProductImageForId(productsById, rule.getAntecedent().isEmpty() ? null : rule.getAntecedent().get(0)),
                resolveProductImageForId(productsById, rule.getConsequent().isEmpty() ? null : rule.getConsequent().get(0)),
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
                row.getImageUrl(),
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
            baseProductParams(marketId, window, null, null, null),
            (rs, rowNum) -> mapSeasonality(granularity, rs)
        );
    }

    private List<SalesTrendPointDTO> fetchSalesTrend(UUID marketId, Window window) {
        return jdbcTemplate.query(
            "select cast(i.data_emissao as date) as sale_date, coalesce(sum(i.valor_total), 0) as revenue " +
            "from invoices i where i.market_id = :marketId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive " +
            "group by cast(i.data_emissao as date) order by sale_date",
            baseProductParams(marketId, window, null, null, null),
            (rs, rowNum) -> new SalesTrendPointDTO(
                rs.getDate("sale_date").toLocalDate(),
                defaultBigDecimal(rs.getBigDecimal("revenue"))
            )
        );
    }

    private List<SalesTrendPointDTO> fetchProductSalesTrend(UUID marketId, UUID productId, Window window) {
        return jdbcTemplate.query(
            "select cast(i.data_emissao as date) as sale_date, coalesce(sum(it.valor_total), 0) as revenue " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "where i.market_id = :marketId and it.product_id = :productId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive " +
            "group by cast(i.data_emissao as date) order by sale_date",
            baseProductParams(marketId, window, null, null, productId),
            (rs, rowNum) -> new SalesTrendPointDTO(
                rs.getDate("sale_date").toLocalDate(),
                defaultBigDecimal(rs.getBigDecimal("revenue"))
            )
        );
    }

    private List<SeasonalityPointDTO> fetchProductWeekdaySeasonality(UUID marketId, UUID productId, Window window) {
        return jdbcTemplate.query(
            "select cast(extract(dow from i.data_emissao) as integer) as bucket, " +
            "coalesce(sum(it.valor_total), 0) as revenue, coalesce(sum(it.quantidade), 0) as quantity, " +
            "count(distinct i.id) as transactions, coalesce(sum(it.valor_total) / nullif(count(distinct i.id), 0), 0) as average_ticket " +
            "from invoice_items it join invoices i on i.id = it.invoice_id " +
            "where i.market_id = :marketId and it.product_id = :productId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive " +
            "group by cast(extract(dow from i.data_emissao) as integer) order by bucket",
            baseProductParams(marketId, window, null, null, productId),
            (rs, rowNum) -> mapSeasonality(SeasonalityGranularity.WEEKDAY, rs)
        );
    }

    private List<ProductBranchPerformanceDTO> fetchProductBranchPerformance(UUID marketId, UUID productId, Window window) {
        String baselineSubquery =
            "select it2.product_id, avg(it2.valor_unitario) as baseline_price " +
            "from invoice_items it2 " +
            "join invoices i2 on i2.id = it2.invoice_id " +
            "where i2.market_id = :marketId and i2.data_emissao >= :baselineStart and i2.data_emissao < :endExclusive " +
            "group by it2.product_id";

        return jdbcTemplate.query(
            "select pdv.id as branch_id, coalesce(pdv.name, 'Operacao sem PDV') as branch_name, " +
            "coalesce(sum(it.valor_total), 0) as revenue, coalesce(sum(it.quantidade), 0) as quantity_sold, " +
            "coalesce(avg(it.valor_unitario), 0) as average_price, count(distinct i.id) as transaction_count, " +
            "coalesce(sum(case when it.valor_unitario <= coalesce(b.baseline_price, it.valor_unitario) * 0.95 then it.valor_total else 0 end), 0) as promo_revenue, " +
            "max(i.data_emissao) as last_sold_at " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "left join pdvs pdv on pdv.id = i.pdv_id " +
            "left join (" + baselineSubquery + ") b on b.product_id = it.product_id " +
            "where i.market_id = :marketId and it.product_id = :productId and i.data_emissao >= :startDate and i.data_emissao < :endExclusive " +
            "group by pdv.id, pdv.name order by revenue desc, quantity_sold desc, branch_name asc",
            baseProductParams(marketId, window, null, null, productId),
            (rs, rowNum) -> {
                BigDecimal revenue = defaultBigDecimal(rs.getBigDecimal("revenue"));
                BigDecimal promoRevenue = defaultBigDecimal(rs.getBigDecimal("promo_revenue"));
                BigDecimal share = revenue.compareTo(BigDecimal.ZERO) > 0
                    ? promoRevenue.divide(revenue, 4, RoundingMode.HALF_UP)
                    : zero(4);
                return new ProductBranchPerformanceDTO(
                    uuid(rs, "branch_id"),
                    rs.getString("branch_name"),
                    revenue,
                    defaultBigDecimal(rs.getBigDecimal("quantity_sold")),
                    defaultBigDecimal(rs.getBigDecimal("average_price")),
                    rs.getLong("transaction_count"),
                    share,
                    localDateTime(rs, "last_sold_at")
                );
            }
        );
    }

    private List<ProductPairInsightDTO> fetchProductRelatedPairs(UUID marketId, UUID productId, int limit) {
        List<MarketBasketDTO> rules = marketBasketService.analyzeMarketBasket(marketId, 0.01, 0.15);
        Map<UUID, Product> productsById = loadProductsById(
            rules.stream()
                .flatMap(rule -> java.util.stream.Stream.concat(rule.getAntecedent().stream(), rule.getConsequent().stream()))
                .toList()
        );
        return rules.stream()
            .filter(rule -> rule.getAntecedent().contains(productId) || rule.getConsequent().contains(productId))
            .limit(limit)
            .map(rule -> new ProductPairInsightDTO(
                rule.getAntecedent().isEmpty() ? null : rule.getAntecedent().get(0),
                rule.getConsequent().isEmpty() ? null : rule.getConsequent().get(0),
                rule.getAntecedentNames() == null || rule.getAntecedentNames().isEmpty() ? null : rule.getAntecedentNames().get(0),
                rule.getConsequentNames() == null || rule.getConsequentNames().isEmpty() ? null : rule.getConsequentNames().get(0),
                resolveProductImageForId(productsById, rule.getAntecedent().isEmpty() ? null : rule.getAntecedent().get(0)),
                resolveProductImageForId(productsById, rule.getConsequent().isEmpty() ? null : rule.getConsequent().get(0)),
                rule.getSupport(),
                rule.getConfidence(),
                rule.getLift(),
                rule.getPairCount()
            ))
            .toList();
    }

    private List<SeasonalProductCollectionDTO> fetchSeasonalCollections(UUID marketId, LocalDate referenceDate) {
        List<SeasonalWindow> windows = resolveSeasonalWindows(referenceDate);
        List<SeasonalProductCollectionDTO> collections = new ArrayList<>();
        for (SeasonalWindow window : windows) {
            List<ProductPerformanceDTO> performance = loadProductPerformanceRows(
                marketId,
                new Window(window.analysisStart(), window.analysisEnd()),
                null,
                null,
                null
            ).stream()
                .filter(row -> defaultBigDecimal(row.getRevenue()).compareTo(BigDecimal.ZERO) > 0)
                .toList();

            List<ProductPerformanceDTO> products = topProducts(performance, "REVENUE", 8);
            BigDecimal totalRevenue = performance.stream()
                .map(ProductPerformanceDTO::getRevenue)
                .map(this::defaultBigDecimal)
                .reduce(zero(2), BigDecimal::add);
            BigDecimal totalQuantity = performance.stream()
                .map(ProductPerformanceDTO::getQuantitySold)
                .map(this::defaultBigDecimal)
                .reduce(zero(3), BigDecimal::add);
            long totalTransactions = performance.stream()
                .map(ProductPerformanceDTO::getTransactionCount)
                .filter(java.util.Objects::nonNull)
                .mapToLong(Long::longValue)
                .sum();

            collections.add(new SeasonalProductCollectionDTO(
                window.key(),
                window.title(),
                buildSeasonalSubtitle(window, totalRevenue, totalTransactions),
                window.periodLabel(),
                window.proximityLabel(),
                window.status(),
                totalRevenue,
                totalQuantity,
                totalTransactions,
                products
            ));
        }
        return collections;
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
        return baseProductParams(marketId, window, category, null, null);
    }

    private MapSqlParameterSource baseProductParams(
        UUID marketId,
        Window window,
        String category,
        String search,
        UUID productId
    ) {
        String normalizedSearch = search == null || search.isBlank() ? null : "%" + search.trim().toLowerCase(Locale.ROOT) + "%";
        return new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("startDate", window.start().atStartOfDay())
            .addValue("endExclusive", window.end().plusDays(1).atStartOfDay())
            .addValue("previousStart", window.start().minusDays(window.lengthDays()).atStartOfDay())
            .addValue("baselineStart", window.start().minusDays(Math.max(window.lengthDays(), 90)).atStartOfDay())
            .addValue("category", category == null || category.isBlank() ? null : category.trim(), Types.VARCHAR)
            .addValue("searchLike", normalizedSearch, Types.VARCHAR)
            .addValue("productId", productId, Types.OTHER);
    }

    private void appendProductFilters(StringBuilder sql, MapSqlParameterSource params, String productAlias) {
        Object category = params.getValue("category");
        Object productId = params.getValue("productId");
        Object searchLike = params.getValue("searchLike");

        if (category != null) {
            sql.append(" and ").append(productAlias).append(".category = :category");
        }
        if (productId != null) {
            sql.append(" and ").append(productAlias).append(".id = :productId");
        }
        if (searchLike != null) {
            sql.append(" and (lower(coalesce(")
                .append(productAlias)
                .append(".name, '')) like :searchLike or lower(coalesce(")
                .append(productAlias)
                .append(".ean, '')) like :searchLike)");
        }
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
                default -> "Sáb";
            };
            case HOUR -> String.format("%02dh", bucket);
            case MONTH -> switch (bucket) {
                case 1 -> "Jan";
                case 2 -> "Fev";
                case 3 -> "Mar";
                case 4 -> "Abr";
                case 5 -> "Mai";
                case 6 -> "Jun";
                case 7 -> "Jul";
                case 8 -> "Ago";
                case 9 -> "Set";
                case 10 -> "Out";
                case 11 -> "Nov";
                default -> "Dez";
            };
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

    private Map<UUID, Product> loadProductsById(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        return productRepository.findAllById(ids).stream()
            .collect(java.util.stream.Collectors.toMap(Product::getId, product -> product));
    }

    private String resolveProductImageForId(Map<UUID, Product> productsById, UUID productId) {
        if (productId == null) {
            return null;
        }
        Product product = productsById.get(productId);
        return product != null ? resolveProductImage(product.getImageUrl()) : null;
    }

    private String resolveProductImage(String imageUrl) {
        return catalogImageStorageService.resolveCatalogImageUrl(imageUrl, null);
    }

    private List<SeasonalWindow> resolveSeasonalWindows(LocalDate referenceDate) {
        List<SeasonalTemplate> templates = List.of(
            new SeasonalTemplate("volta-aulas", "Volta às aulas", "Itens que costumam acelerar com a retomada escolar.", 1, 10, 2, 20),
            new SeasonalTemplate("pascoa", "Páscoa", "Itens que ganham força no período pascal.", 3, 15, 4, 15),
            new SeasonalTemplate("festa-junina", "Festa Junina", "Produtos que sobem com o calendário junino.", 6, 1, 6, 30),
            new SeasonalTemplate("dia-criancas", "Dia das Crianças", "Itens que reagem melhor no calendário de outubro.", 9, 25, 10, 12),
            new SeasonalTemplate("natal", "Natal", "Itens que puxam a venda no pico de dezembro.", 12, 1, 12, 25),
            new SeasonalTemplate("ano-novo", "Ano Novo", "Produtos fortes na virada e no abastecimento imediato.", 12, 26, 1, 5)
        );

        return templates.stream()
            .map(template -> resolveSeasonalWindow(template, referenceDate))
            .sorted(Comparator.comparingInt(SeasonalWindow::priority).thenComparingLong(SeasonalWindow::distanceDays))
            .limit(3)
            .toList();
    }

    private SeasonalWindow resolveSeasonalWindow(SeasonalTemplate template, LocalDate referenceDate) {
        List<SeasonalOccurrence> occurrences = List.of(
            createSeasonalOccurrence(template, referenceDate.getYear() - 1),
            createSeasonalOccurrence(template, referenceDate.getYear()),
            createSeasonalOccurrence(template, referenceDate.getYear() + 1)
        );

        SeasonalOccurrence active = occurrences.stream()
            .filter(occurrence -> !referenceDate.isBefore(occurrence.start()) && !referenceDate.isAfter(occurrence.end()))
            .findFirst()
            .orElse(null);

        SeasonalOccurrence previous = occurrences.stream()
            .filter(occurrence -> occurrence.end().isBefore(referenceDate))
            .max(Comparator.comparing(SeasonalOccurrence::end))
            .orElse(null);

        SeasonalOccurrence next = occurrences.stream()
            .filter(occurrence -> occurrence.start().isAfter(referenceDate))
            .min(Comparator.comparing(SeasonalOccurrence::start))
            .orElse(null);

        SeasonalOccurrence displayOccurrence;
        String status;
        String proximityLabel;
        int priority;
        long distanceDays;

        if (active != null) {
            displayOccurrence = active;
            status = "CURRENT";
            distanceDays = Math.max(0L, ChronoUnit.DAYS.between(referenceDate, active.end()));
            proximityLabel = distanceDays <= 1 ? "Acontecendo agora" : "Em andamento";
            priority = 0;
        } else if (previous == null || (next != null && ChronoUnit.DAYS.between(referenceDate, next.start()) <= ChronoUnit.DAYS.between(previous.end(), referenceDate))) {
            displayOccurrence = next != null ? next : previous;
            distanceDays = displayOccurrence != null ? Math.max(0L, ChronoUnit.DAYS.between(referenceDate, displayOccurrence.start())) : Long.MAX_VALUE;
            status = "UPCOMING";
            proximityLabel = distanceDays == 0 ? "Começa hoje" : distanceDays == 1 ? "Começa amanhã" : "Começa em " + distanceDays + " dias";
            priority = 1;
        } else {
            displayOccurrence = previous;
            distanceDays = Math.max(0L, ChronoUnit.DAYS.between(previous.end(), referenceDate));
            status = "RECENT";
            proximityLabel = distanceDays == 1 ? "Terminou ontem" : "Terminou há " + distanceDays + " dias";
            priority = 2;
        }

        SeasonalOccurrence analysisOccurrence = ("RECENT".equals(status) || (active == null && next == null))
            ? displayOccurrence
            : previous != null ? previous : displayOccurrence;

        return new SeasonalWindow(
            template.key(),
            template.title(),
            template.subtitle(),
            analysisOccurrence.start(),
            analysisOccurrence.end(),
            formatPeriodLabel(analysisOccurrence.start(), analysisOccurrence.end()),
            proximityLabel,
            status,
            priority,
            distanceDays
        );
    }

    private SeasonalOccurrence createSeasonalOccurrence(SeasonalTemplate template, int startYear) {
        LocalDate start = LocalDate.of(startYear, template.startMonth(), template.startDay());
        int endYear = template.crossYear() ? startYear + 1 : startYear;
        LocalDate end = LocalDate.of(endYear, template.endMonth(), template.endDay());
        return new SeasonalOccurrence(start, end);
    }

    private String formatPeriodLabel(LocalDate start, LocalDate end) {
        return start.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy"))
            + " a "
            + end.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy"));
    }

    private String buildSeasonalSubtitle(SeasonalWindow window, BigDecimal totalRevenue, long totalTransactions) {
        String timing = switch (window.status()) {
            case "CURRENT" -> window.title() + " está em andamento.";
            case "UPCOMING" -> window.proximityLabel() + " para " + window.title() + ".";
            default -> window.proximityLabel() + " o último ciclo de " + window.title() + ".";
        };
        String context = window.subtitle() != null && !window.subtitle().isBlank()
            ? window.subtitle().trim() + " "
            : "";

        if (totalRevenue.compareTo(BigDecimal.ZERO) <= 0 || totalTransactions <= 0) {
            return timing + " " + context + "Ainda não há vendas suficientes registradas para esta janela comparável.";
        }

        return timing
            + " "
            + context
            + " No último ciclo comparável ("
            + window.periodLabel()
            + "), os itens dessa janela geraram "
            + formatCurrency(totalRevenue)
            + " em "
            + totalTransactions
            + " compras.";
    }

    private String formatCurrency(BigDecimal value) {
        NumberFormat formatter = NumberFormat.getCurrencyInstance(new Locale("pt", "BR"));
        return formatter.format(defaultBigDecimal(value));
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

    /**
     * Loads per-product daily revenue for the window and computes:
     *   [0] = momentumScore — EMA(7) / SMA(28), capped to [0, 3]
     *
     * Returns a map: productId → double[] { momentumScore }
     */
    private Map<UUID, double[]> loadMomentumScores(UUID marketId, Window window, UUID singleProductId) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("startDate", window.start().atStartOfDay())
            .addValue("endExclusive", window.end().plusDays(1).atStartOfDay());
        if (singleProductId != null) {
            params.addValue("productId", singleProductId, java.sql.Types.OTHER);
        }

        StringBuilder sql = new StringBuilder(
            "select it.product_id, cast(i.data_emissao as date) as sale_date, " +
            "coalesce(sum(it.valor_total), 0) as daily_revenue " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "where i.market_id = :marketId " +
            "and i.data_emissao >= :startDate and i.data_emissao < :endExclusive"
        );
        if (singleProductId != null) sql.append(" and it.product_id = :productId");
        sql.append(" group by it.product_id, cast(i.data_emissao as date) order by it.product_id, sale_date");

        // Accumulate daily values per product
        Map<UUID, java.util.TreeMap<LocalDate, Double>> byProduct = new java.util.LinkedHashMap<>();
        jdbcTemplate.query(sql.toString(), params, rs -> {
            UUID pid;
            Object raw = rs.getObject("product_id");
            pid = raw instanceof UUID u ? u : UUID.fromString(raw.toString());
            LocalDate date = rs.getDate("sale_date").toLocalDate();
            double rev = rs.getDouble("daily_revenue");
            byProduct.computeIfAbsent(pid, k -> new java.util.TreeMap<>()).put(date, rev);
        });

        Map<UUID, double[]> result = new java.util.LinkedHashMap<>();
        for (Map.Entry<UUID, java.util.TreeMap<LocalDate, Double>> entry : byProduct.entrySet()) {
            List<Double> series = new java.util.ArrayList<>(entry.getValue().values());
            if (series.isEmpty()) continue;
            double ema7 = computeEma(series, 7);
            double sma28 = computeSma(series, 28);
            double momentum = sma28 > 0 ? Math.min(3.0, ema7 / sma28) : 1.0;
            result.put(entry.getKey(), new double[]{ momentum });
        }
        return result;
    }

    private double computeEma(List<Double> series, int period) {
        if (series.isEmpty()) return 0;
        double k = 2.0 / (period + 1);
        double ema = series.get(0);
        int start = Math.max(0, series.size() - period * 3); // look-back window
        for (int i = start; i < series.size(); i++) {
            ema = series.get(i) * k + ema * (1 - k);
        }
        return ema;
    }

    private double computeSma(List<Double> series, int period) {
        if (series.isEmpty()) return 0;
        int from = Math.max(0, series.size() - period);
        double sum = 0;
        int count = 0;
        for (int i = from; i < series.size(); i++) {
            sum += series.get(i);
            count++;
        }
        return count > 0 ? sum / count : 0;
    }

    /**
     * Composite health score 0–100:
     *  - 40 pts: revenue trend capped to [-50%, +50%] → mapped to [0, 40]
     *  - 30 pts: sales velocity relative to window length → days active / window length * 30
     *  - 20 pts: momentum (EMA/SMA ratio) → capped at 2.0 * 10
     *  - 10 pts: trend direction bonus (positive trend)
     */
    private Double computeHealthScore(double trendPct, BigDecimal velocity, int salesDays, Window window, double[] ms) {
        if (velocity == null || velocity.compareTo(BigDecimal.ZERO) == 0) return null;

        double trendComponent = Math.min(40, Math.max(0, (trendPct + 50) / 100.0 * 40));
        double consistencyComponent = window.lengthDays() > 0
            ? Math.min(30, (double) salesDays / window.lengthDays() * 30)
            : 0;
        double momentumComponent = ms != null ? Math.min(20, ms[0] * 10) : 10;
        double bonusComponent = trendPct > 0 ? 10 : 0;

        double raw = trendComponent + consistencyComponent + momentumComponent + bonusComponent;
        return Math.min(100, Math.max(0, raw));
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

    private record ProductSnapshot(UUID productId, String ean, String name, String category, String imageUrl) {
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

    private record SeasonalTemplate(
        String key,
        String title,
        String subtitle,
        int startMonth,
        int startDay,
        int endMonth,
        int endDay
    ) {
        boolean crossYear() {
            return endMonth < startMonth || (endMonth == startMonth && endDay < startDay);
        }
    }

    private record SeasonalOccurrence(LocalDate start, LocalDate end) {
    }

    private record SeasonalWindow(
        String key,
        String title,
        String subtitle,
        LocalDate analysisStart,
        LocalDate analysisEnd,
        String periodLabel,
        String proximityLabel,
        String status,
        int priority,
        long distanceDays
    ) {
    }

    // ── Seasonal windows definition ───────────────────────────────────────────

    private record SeasonalWindow(
        String key,
        String title,
        int monthStart, int dayStart,
        int monthEnd, int dayEnd
    ) {
        /** Returns the window dates relative to a given reference year, handling year rollover. */
        LocalDate start(int year) { return LocalDate.of(year, monthStart, dayStart); }
        LocalDate end(int year)   { return LocalDate.of(year, monthEnd, dayEnd); }
    }

    private static final List<SeasonalWindow> SEASONAL_WINDOWS = List.of(
        new SeasonalWindow("natal",        "Natal",          12,  1, 12, 31),
        new SeasonalWindow("pascoa",       "Páscoa",          3,  1,  4, 30),
        new SeasonalWindow("carnaval",     "Carnaval",        2,  1,  2, 28),
        new SeasonalWindow("dia_maes",     "Dia das Mães",    5,  1,  5, 31),
        new SeasonalWindow("dia_pais",     "Dia dos Pais",    8,  1,  8, 31),
        new SeasonalWindow("dia_criancas", "Dia das Crianças",10, 1, 10, 31),
        new SeasonalWindow("black_friday", "Black Friday",   11, 20, 11, 30),
        new SeasonalWindow("ferias_jul",   "Férias Julho",    7,  1,  7, 31),
        new SeasonalWindow("ferias_jan",   "Férias Janeiro",  1,  1,  1, 31)
    );

    private List<ProductSeasonalPerformanceDTO> fetchProductSeasonalPerformance(
        UUID marketId, UUID productId, LocalDate referenceDate
    ) {
        // Compute baseline: average daily revenue for this product in the 90-day window (excluding current seasonal windows)
        MapSqlParameterSource baseParams = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("productId", productId)
            .addValue("since", referenceDate.minusDays(365));

        String baselineSql =
            "select coalesce(sum(it.valor_total), 0) as total_revenue, " +
            "       count(distinct cast(i.data_emissao as date)) as sales_days " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "where i.market_id = :marketId " +
            "  and it.product_id = :productId " +
            "  and i.data_emissao >= :since";

        double[] base = new double[]{0.0, 0.0};
        jdbcTemplate.query(baselineSql, baseParams, rs -> {
            base[0] = rs.getDouble("total_revenue");
            base[1] = rs.getDouble("sales_days");
        });
        double dailyBaseline = base[1] > 0 ? base[0] / base[1] : 0.0;

        DateTimeFormatter ptBR = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        List<ProductSeasonalPerformanceDTO> results = new ArrayList<>();

        for (SeasonalWindow sw : SEASONAL_WINDOWS) {
            // Try current year first, then previous year if window is in the future
            int year = referenceDate.getYear();
            LocalDate windowStart = sw.start(year);
            LocalDate windowEnd   = sw.end(year);

            // If the window starts after reference date by more than 365 days, skip to previous year
            if (windowStart.isAfter(referenceDate.plusDays(365))) {
                year--;
                windowStart = sw.start(year);
                windowEnd   = sw.end(year);
            }

            // Determine status
            String status;
            long daysUntilStart = ChronoUnit.DAYS.between(referenceDate, windowStart);
            long daysUntilEnd   = ChronoUnit.DAYS.between(referenceDate, windowEnd);
            if (daysUntilEnd < 0) {
                status = "RECENT";
            } else if (daysUntilStart <= 0) {
                status = "CURRENT";
            } else {
                status = "UPCOMING";
            }

            // Only show RECENT within 180 days past, UPCOMING within 180 days ahead
            long daysSinceEnd = -daysUntilEnd;
            if (status.equals("RECENT") && daysSinceEnd > 180) continue;
            if (status.equals("UPCOMING") && daysUntilStart > 180) continue;

            String proximityLabel = switch (status) {
                case "CURRENT"  -> "Em andamento";
                case "UPCOMING" -> "Começa em " + daysUntilStart + " dias";
                case "RECENT"   -> "Encerrou há " + daysSinceEnd + " dias";
                default -> "";
            };

            MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("marketId", marketId)
                .addValue("productId", productId)
                .addValue("windowStart", windowStart.atStartOfDay())
                .addValue("windowEnd", windowEnd.plusDays(1).atStartOfDay());

            String sql =
                "select coalesce(sum(it.valor_total), 0) as revenue, " +
                "       coalesce(sum(it.quantidade), 0) as quantity, " +
                "       count(distinct i.id) as transactions " +
                "from invoice_items it " +
                "join invoices i on i.id = it.invoice_id " +
                "where i.market_id = :marketId " +
                "  and it.product_id = :productId " +
                "  and i.data_emissao >= :windowStart " +
                "  and i.data_emissao < :windowEnd";

            double[] row = {0, 0, 0};
            jdbcTemplate.query(sql, p, rs -> {
                row[0] = rs.getDouble("revenue");
                row[1] = rs.getDouble("quantity");
                row[2] = rs.getDouble("transactions");
            });

            long windowDays = Math.max(1, ChronoUnit.DAYS.between(windowStart, windowEnd) + 1);
            double dailyRevInWindow = row[0] / windowDays;
            double index = dailyBaseline > 0 ? dailyRevInWindow / dailyBaseline : (row[0] > 0 ? 1.5 : 0.0);

            String signal;
            if (index >= 1.3) signal = "HIGH_SEASON";
            else if (index <= 0.7 && row[0] > 0) signal = "LOW_SEASON";
            else signal = "NEUTRAL";

            // Only emit NEUTRAL if there were actual sales
            if (signal.equals("NEUTRAL") && row[0] == 0 && status.equals("RECENT")) signal = "LOW_SEASON";

            results.add(new ProductSeasonalPerformanceDTO(
                sw.key(),
                sw.title(),
                status,
                proximityLabel,
                windowStart.format(ptBR) + " a " + windowEnd.format(ptBR),
                BigDecimal.valueOf(row[0]).setScale(2, RoundingMode.HALF_UP),
                BigDecimal.valueOf(row[1]).setScale(3, RoundingMode.HALF_UP),
                (long) row[2],
                Math.round(index * 100.0) / 100.0,
                signal
            ));
        }

        // Sort: CURRENT first, then UPCOMING by proximity, then RECENT
        results.sort(Comparator
            .comparingInt((ProductSeasonalPerformanceDTO d) -> switch (d.getStatus()) {
                case "CURRENT"  -> 0;
                case "UPCOMING" -> 1;
                case "RECENT"   -> 2;
                default -> 3;
            })
            .thenComparing(d -> {
                // within UPCOMING: sort by proximity (ascending days until)
                if ("UPCOMING".equals(d.getStatus())) {
                    return d.getProximityLabel();
                }
                return d.getTitle();
            })
        );

        return results;
    }

    private ProductPurchaseSignalDTO buildPurchaseSignal(
        ProductPerformanceDTO overview,
        List<ProductSeasonalPerformanceDTO> seasonal,
        LocalDate referenceDate
    ) {
        double velocity = overview.getSalesVelocity() != null ? overview.getSalesVelocity().doubleValue() : 0;
        double trendPct = overview.getRevenueTrendPercentage() != null ? overview.getRevenueTrendPercentage() : 0;

        // Dormancy: days since last sale
        long daysWithoutSale = 0;
        if (overview.getLastSoldAt() != null) {
            daysWithoutSale = ChronoUnit.DAYS.between(
                overview.getLastSoldAt().toLocalDate(), referenceDate
            );
        } else {
            daysWithoutSale = 90; // unknown → treat as dormant
        }

        // Current or upcoming high-season windows
        List<ProductSeasonalPerformanceDTO> highSeasonUpcoming = seasonal.stream()
            .filter(s -> ("UPCOMING".equals(s.getStatus()) || "CURRENT".equals(s.getStatus()))
                      && "HIGH_SEASON".equals(s.getSignal()))
            .toList();

        // Determine decision
        String decision;
        String decisionLabel;
        String decisionReason;

        if (daysWithoutSale >= 30) {
            decision = "CAUTION";
            decisionLabel = "Atenção: produto parado";
            decisionReason = String.format(
                "Este produto está sem venda há %d dias. Avalie se ainda tem demanda antes de repor estoque.",
                daysWithoutSale
            );
        } else if (velocity <= 0.05 && trendPct < -20) {
            decision = "REDUCE";
            decisionLabel = "Reduzir pedido";
            decisionReason = "Velocidade de venda muito baixa e tendência de queda. Reduza o pedido até o produto ganhar tração novamente.";
        } else if (!highSeasonUpcoming.isEmpty() || (velocity >= 1.0 && trendPct >= 0)) {
            decision = "BUY";
            decisionLabel = "Comprar agora";
            String seasonHint = highSeasonUpcoming.isEmpty() ? "" :
                " " + highSeasonUpcoming.get(0).getTitle() + " se aproxima — reforce o estoque.";
            decisionReason = String.format(
                "Velocidade atual de %.1f un/dia com tendência de %+.0f%%.%s",
                velocity, trendPct, seasonHint
            );
        } else {
            decision = "HOLD";
            decisionLabel = "Manter reposição normal";
            decisionReason = String.format(
                "Giro de %.1f un/dia dentro do esperado. Mantenha o ciclo de reposição habitual.",
                velocity
            );
        }

        // Suggested order quantity (cover 14 days + seasonal uplift)
        double coverDays = 14.0;
        double upliftMultiplier = 1.0;
        if (!highSeasonUpcoming.isEmpty()) {
            double maxUplift = highSeasonUpcoming.stream()
                .mapToDouble(s -> s.getIndexVsBaseline())
                .max().orElse(1.0);
            upliftMultiplier = Math.min(maxUplift, 3.0);
            coverDays = 21.0; // extend coverage for season
        }
        double suggestedQty = Math.max(0, velocity * coverDays * upliftMultiplier);

        // Stock projection periods (upcoming high-season windows only)
        List<ProductPurchaseSignalDTO.StockProjectionPeriod> projections = new ArrayList<>();
        for (ProductSeasonalPerformanceDTO s : seasonal) {
            if (!"UPCOMING".equals(s.getStatus()) && !"CURRENT".equals(s.getStatus())) continue;
            if (!"HIGH_SEASON".equals(s.getSignal())) continue;
            int weeksToRestock = (int) Math.max(1, Math.round(s.getIndexVsBaseline() * 0.8));
            projections.add(new ProductPurchaseSignalDTO.StockProjectionPeriod(
                s.getTitle() + " (" + s.getPeriodLabel() + ")",
                s.getKey(),
                s.getIndexVsBaseline(),
                "Reforce o estoque " + weeksToRestock + " semana(s) antes",
                s.getProximityLabel()
            ));
        }

        return new ProductPurchaseSignalDTO(
            decision,
            decisionLabel,
            decisionReason,
            BigDecimal.valueOf(velocity).setScale(2, RoundingMode.HALF_UP),
            BigDecimal.valueOf(coverDays).setScale(0, RoundingMode.HALF_UP),
            BigDecimal.valueOf(suggestedQty).setScale(0, RoundingMode.HALF_UP),
            BigDecimal.valueOf(daysWithoutSale),
            projections
        );
    }

    private enum SeasonalityGranularity {
        WEEKDAY,
        HOUR,
        MONTH
    }
}

