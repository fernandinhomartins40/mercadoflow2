package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.dto.MarketDashboardDTO;
import com.pdv2cloud.model.dto.MarketSummaryDTO;
import com.pdv2cloud.model.dto.ProductAnalyticsDTO;
import com.pdv2cloud.model.dto.TopSellerDTO;
import com.pdv2cloud.model.dto.AlertDTO;
import com.pdv2cloud.model.dto.DemandForecastDTO;
import com.pdv2cloud.model.entity.AlertPriority;
import com.pdv2cloud.model.entity.AlertType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.AlertService;
import com.pdv2cloud.service.AnalyticsService;
import com.pdv2cloud.service.ForecastService;
import com.pdv2cloud.service.MarketAccessService;
import java.time.LocalDate;
import java.util.List;
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

@RestController
@RequestMapping("/api/v1/markets")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class MarketController {

    @Autowired
    private AnalyticsService analyticsService;

    @Autowired
    private AlertService alertService;

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private MarketAccessService marketAccessService;

    @Autowired
    private ForecastService forecastService;

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

    @GetMapping("/{id}/analytics/demand-forecast")
    public ResponseEntity<List<DemandForecastDTO>> getDemandForecast(
        @PathVariable("id") UUID id,
        @RequestParam(defaultValue = "7") int days,
        Authentication authentication) {

        marketAccessService.assertCanAccessMarket(id, authentication);
        return ResponseEntity.ok(forecastService.getForecast(id, days));
    }
}
