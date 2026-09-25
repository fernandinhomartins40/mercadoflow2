package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.dto.MarketCockpitDTO;
import com.pdv2cloud.model.dto.ProductPromoEffectivenessDTO;
import com.pdv2cloud.model.dto.MarketDashboardDTO;
import com.pdv2cloud.model.dto.MarketSummaryDTO;
import com.pdv2cloud.model.dto.ProductAnalyticsDTO;
import com.pdv2cloud.model.dto.ProductDashboardDTO;
import com.pdv2cloud.model.dto.ProductPriceEventDTO;
import com.pdv2cloud.model.dto.ProductPriceTimelineDTO;
import com.pdv2cloud.model.dto.ProductPerformanceDTO;
import com.pdv2cloud.model.dto.ProductPromotionWindowDTO;
import com.pdv2cloud.model.dto.CampaignImpactDTO;
import com.pdv2cloud.model.dto.SeasonalityPointDTO;
import com.pdv2cloud.model.dto.PurchasePriceHistoryDTO;
import com.pdv2cloud.model.dto.RecordPurchaseRequest;
import com.pdv2cloud.model.dto.ShoppingListItemDTO;
import com.pdv2cloud.model.dto.ShoppingListItemUpsertRequest;
import com.pdv2cloud.model.dto.ShoppingListOverviewDTO;
import com.pdv2cloud.model.dto.TopSellerDTO;
import com.pdv2cloud.model.dto.AlertDTO;
import com.pdv2cloud.model.dto.DemandForecastDTO;
import com.pdv2cloud.model.entity.AlertPriority;
import com.pdv2cloud.model.entity.AlertType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.AlertService;
import com.pdv2cloud.service.AdvancedAnalyticsService;
import com.pdv2cloud.service.AnalyticsService;
import com.pdv2cloud.service.ForecastService;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.PlanService;
import com.pdv2cloud.service.PriceIntelligenceService;
import com.pdv2cloud.service.PromoEffectivenessService;
import com.pdv2cloud.service.PurchasePriceService;
import com.pdv2cloud.service.ShoppingListService;
import com.pdv2cloud.service.StoreLayoutService;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class MarketController {

    @Autowired
    private AnalyticsService analyticsService;

    @Autowired
    private AdvancedAnalyticsService advancedAnalyticsService;

    @Autowired
    private AlertService alertService;

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private MarketAccessService marketAccessService;

    @Autowired
    private ForecastService forecastService;

    @Autowired
    private PlanService planService;

    @Autowired
    private PriceIntelligenceService priceIntelligenceService;

    @Autowired
    private ShoppingListService shoppingListService;

    @Autowired
    private PurchasePriceService purchasePriceService;

    @Autowired
    private PromoEffectivenessService promoEffectivenessService;

    @Autowired
    private StoreLayoutService storeLayoutService;

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<MarketSummaryDTO>> listMarkets() {
        List<MarketSummaryDTO> markets = marketRepository.findAllActive().stream()
            .map(market -> new MarketSummaryDTO(market.getId(), market.getName()))
            .collect(Collectors.toList());
        return ResponseEntity.ok(markets);
    }

    @GetMapping("/{id}/dashboard")
    public ResponseEntity<MarketDashboardDTO> getDashboard(
        @PathVariable("id") UUID id,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        MarketDashboardDTO dashboard = analyticsService.getMarketDashboard(id, startDate, endDate);
        return ResponseEntity.ok(dashboard);
    }

    @GetMapping("/{id}/analytics/cockpit")
    public ResponseEntity<MarketCockpitDTO> getCockpit(
        @PathVariable("id") UUID id,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(advancedAnalyticsService.getCockpit(id, startDate, endDate));
    }

    @GetMapping("/{id}/products")
    public ResponseEntity<Page<ProductAnalyticsDTO>> getProducts(
        @PathVariable("id") UUID id,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(required = false) String category,
        @RequestParam(required = false) String sortBy,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        Pageable pageable = PageRequest.of(page, size);
        Page<ProductAnalyticsDTO> products = analyticsService.getProductAnalytics(id, category, sortBy, pageable);
        return ResponseEntity.ok(products);
    }

    @GetMapping("/{id}/analytics/products/performance")
    public ResponseEntity<Page<ProductPerformanceDTO>> getProductPerformance(
        @PathVariable("id") UUID id,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(required = false) String category,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String sortBy,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        Pageable pageable = PageRequest.of(page, size);
        return ResponseEntity.ok(
            advancedAnalyticsService.getProductPerformance(id, startDate, endDate, category, search, sortBy, pageable)
        );
    }

    @GetMapping("/{id}/analytics/products/{productId}")
    public ResponseEntity<ProductDashboardDTO> getProductDashboard(
        @PathVariable("id") UUID id,
        @PathVariable("productId") UUID productId,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(advancedAnalyticsService.getProductDashboard(id, productId, startDate, endDate));
    }

    @GetMapping("/{id}/analytics/products/{productId}/price-timeline")
    public ResponseEntity<ProductPriceTimelineDTO> getProductPriceTimeline(
        @PathVariable("id") UUID id,
        @PathVariable("productId") UUID productId,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(priceIntelligenceService.getProductPriceTimeline(id, productId, startDate, endDate));
    }

    @GetMapping("/{id}/analytics/products/{productId}/price-events")
    public ResponseEntity<List<ProductPriceEventDTO>> getProductPriceEvents(
        @PathVariable("id") UUID id,
        @PathVariable("productId") UUID productId,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(priceIntelligenceService.getProductPriceEvents(id, productId, startDate, endDate));
    }

    @GetMapping("/{id}/analytics/products/{productId}/promotion-windows")
    public ResponseEntity<List<ProductPromotionWindowDTO>> getPromotionWindows(
        @PathVariable("id") UUID id,
        @PathVariable("productId") UUID productId,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(priceIntelligenceService.getProductPromotionWindows(id, productId, startDate, endDate));
    }

    @PostMapping("/{id}/analytics/price-intelligence/rebuild")
    public ResponseEntity<Map<String, Object>> rebuildPriceIntelligence(
        @PathVariable("id") UUID id,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(id, authentication);
        int products = priceIntelligenceService.rebuildMarket(id);
        return ResponseEntity.ok(Map.of(
            "status", "REBUILT",
            "products", products
        ));
    }

    @GetMapping("/{id}/alerts")
    public ResponseEntity<List<AlertDTO>> getAlerts(
        @PathVariable("id") UUID id,
        @RequestParam(required = false) AlertType type,
        @RequestParam(required = false) AlertPriority priority,
        @RequestParam(defaultValue = "false") boolean onlyUnread,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        List<AlertDTO> alerts = alertService.getAlerts(id, type, priority, onlyUnread);
        return ResponseEntity.ok(alerts);
    }

    @PostMapping("/{id}/alerts/{alertId}/read")
    public ResponseEntity<Void> markAlertRead(
        @PathVariable("id") UUID id,
        @PathVariable("alertId") UUID alertId,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        alertService.markAsRead(id, alertId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/alerts/read-all")
    public ResponseEntity<?> markAllAlertsRead(
        @PathVariable("id") UUID id,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        int updated = alertService.markAllAsRead(id);
        return ResponseEntity.ok(java.util.Map.of("updated", updated));
    }

    @GetMapping("/{id}/analytics/top-sellers")
    public ResponseEntity<List<TopSellerDTO>> getTopSellers(
        @PathVariable("id") UUID id,
        @RequestParam(defaultValue = "10") int limit,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        List<TopSellerDTO> topSellers = analyticsService.getTopSellers(id, limit, startDate, endDate);
        return ResponseEntity.ok(topSellers);
    }

    @GetMapping("/{id}/analytics/market-basket")
    public ResponseEntity<List<MarketBasketDTO>> getMarketBasketAnalysis(
        @PathVariable("id") UUID id,
        @RequestParam(defaultValue = "0.01") double minSupport,
        @RequestParam(defaultValue = "0.5") double minConfidence,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        List<MarketBasketDTO> analysis = analyticsService.getMarketBasketAnalysis(id, minSupport, minConfidence);
        return ResponseEntity.ok(analysis);
    }

    @GetMapping("/{id}/analytics/market-basket/cached")
    public ResponseEntity<List<MarketBasketDTO>> getCachedMarketBasket(
        @PathVariable("id") UUID id,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(analyticsService.getCachedMarketBasketAnalysis(id));
    }

    @GetMapping("/{id}/shopping-list")
    public ResponseEntity<ShoppingListOverviewDTO> getShoppingList(
        @PathVariable("id") UUID id,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(shoppingListService.getOverview(id));
    }

    @PostMapping("/{id}/shopping-list/items")
    public ResponseEntity<ShoppingListItemDTO> addShoppingListItem(
        @PathVariable("id") UUID id,
        @RequestBody ShoppingListItemUpsertRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(shoppingListService.addOrUpdate(id, request));
    }

    @PatchMapping("/{id}/shopping-list/items/{itemId}")
    public ResponseEntity<ShoppingListItemDTO> updateShoppingListItem(
        @PathVariable("id") UUID id,
        @PathVariable("itemId") UUID itemId,
        @RequestBody ShoppingListItemUpsertRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(shoppingListService.updateItem(id, itemId, request));
    }

    @DeleteMapping("/{id}/shopping-list/items/{itemId}")
    public ResponseEntity<Void> deleteShoppingListItem(
        @PathVariable("id") UUID id,
        @PathVariable("itemId") UUID itemId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(id, authentication);
        shoppingListService.deleteItem(id, itemId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/purchase-history")
    public ResponseEntity<PurchasePriceHistoryDTO> recordPurchase(
        @PathVariable("id") UUID id,
        @RequestBody RecordPurchaseRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(purchasePriceService.recordPurchase(id, request));
    }

    @GetMapping("/{id}/purchase-history/{productId}")
    public ResponseEntity<List<PurchasePriceHistoryDTO>> getPurchaseHistory(
        @PathVariable("id") UUID id,
        @PathVariable("productId") UUID productId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(purchasePriceService.getHistory(id, productId));
    }

    /**
     * Previsão de demanda.
     *
     * O horizonte é o limite do plano gratuito desde 12/08/2026: uma semana
     * basta para repor a prateleira, um mês é o que permite negociar com
     * fornecedor. É o recurso mais caro de calcular e o mais fácil de explicar
     * como pago — o gratuito reage, o pago antecipa.
     */
    @GetMapping("/{id}/analytics/demand-forecast")
    public ResponseEntity<List<DemandForecastDTO>> getDemandForecast(
        @PathVariable("id") UUID id,
        @RequestParam(defaultValue = "7") int days,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        int horizon = planService.forecastHorizonDays(planService.limitsFor(id), days);
        return ResponseEntity.ok(forecastService.getForecast(id, horizon));
    }

    @GetMapping("/{id}/analytics/campaign-impact")
    public ResponseEntity<List<CampaignImpactDTO>> getCampaignImpact(
        @PathVariable("id") UUID id,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(advancedAnalyticsService.getCampaignImpacts(id));
    }

    @GetMapping("/{id}/analytics/seasonality/weekday")
    public ResponseEntity<List<SeasonalityPointDTO>> getWeekdaySeasonality(
        @PathVariable("id") UUID id,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(advancedAnalyticsService.getWeekdaySeasonality(id, startDate, endDate));
    }

    @GetMapping("/{id}/analytics/promo-effectiveness")
    public ResponseEntity<List<ProductPromoEffectivenessDTO>> getPromoEffectiveness(
        @PathVariable("id") UUID id,
        @RequestParam(defaultValue = "180") int days,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(promoEffectivenessService.analyzeMarket(id, days));
    }

    @GetMapping("/{id}/analytics/promo-effectiveness/{productId}")
    public ResponseEntity<ProductPromoEffectivenessDTO> getProductPromoEffectiveness(
        @PathVariable("id") UUID id,
        @PathVariable("productId") UUID productId,
        @RequestParam(defaultValue = "180") int days,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(promoEffectivenessService.analyzeProduct(id, productId, days));
    }

    // ── Store Layout ──────────────────────────────────────────────────────────

    @GetMapping("/{id}/store-layout")
    public ResponseEntity<Map<String, Object>> getStoreLayout(
        @PathVariable("id") UUID id,
        Authentication authentication) {
        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(storeLayoutService.getLayout(id));
    }

    @PutMapping("/{id}/store-layout")
    public ResponseEntity<Map<String, Object>> saveStoreLayout(
        @PathVariable("id") UUID id,
        @RequestBody Map<String, Object> body,
        Authentication authentication) {
        marketAccessService.assertCanAccessMarket(id, authentication);
        int gridCols = body.containsKey("gridCols") ? ((Number) body.get("gridCols")).intValue() : 4;
        int gridRows = body.containsKey("gridRows") ? ((Number) body.get("gridRows")).intValue() : 5;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> cells = (List<Map<String, Object>>) body.getOrDefault("cells", List.of());
        return ResponseEntity.ok(storeLayoutService.saveLayout(id, gridCols, gridRows, cells));
    }

    @GetMapping("/{id}/store-layout/heatmap")
    public ResponseEntity<List<Map<String, Object>>> getCategoryHeatmap(
        @PathVariable("id") UUID id,
        Authentication authentication) {
        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(storeLayoutService.getCategoryHeatmap(id));
    }

    @PostMapping("/{id}/store-layout/neighbor-insights")
    public ResponseEntity<List<Map<String, Object>>> getNeighborInsights(
        @PathVariable("id") UUID id,
        @RequestBody Map<String, Object> body,
        Authentication authentication) {
        marketAccessService.assertCanAccessMarket(id, authentication);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> cells = (List<Map<String, Object>>) body.getOrDefault("cells", List.of());
        int gridCols = body.containsKey("gridCols") ? ((Number) body.get("gridCols")).intValue() : 4;
        return ResponseEntity.ok(storeLayoutService.getNeighborInsights(id, cells, gridCols));
    }
}
