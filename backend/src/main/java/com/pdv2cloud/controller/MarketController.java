package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.dto.MarketDashboardDTO;
import com.pdv2cloud.model.dto.ProductAnalyticsDTO;
import com.pdv2cloud.model.dto.TopSellerDTO;
import com.pdv2cloud.model.dto.AlertDTO;
import com.pdv2cloud.model.entity.AlertPriority;
import com.pdv2cloud.model.entity.AlertType;
import com.pdv2cloud.service.AlertService;
import com.pdv2cloud.service.AnalyticsService;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/markets")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class MarketController {

    @Autowired
    private AnalyticsService analyticsService;

    @Autowired
    private AlertService alertService;

    @GetMapping("/{id}/dashboard")
    public ResponseEntity<MarketDashboardDTO> getDashboard(
        @PathVariable UUID id,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        MarketDashboardDTO dashboard = analyticsService.getMarketDashboard(id, startDate, endDate);
        return ResponseEntity.ok(dashboard);
    }

    @GetMapping("/{id}/products")
    public ResponseEntity<Page<ProductAnalyticsDTO>> getProducts(
        @PathVariable UUID id,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(required = false) String category,
        @RequestParam(required = false) String sortBy) {

        Pageable pageable = PageRequest.of(page, size);
        Page<ProductAnalyticsDTO> products = analyticsService.getProductAnalytics(id, category, pageable);
        return ResponseEntity.ok(products);
    }

    @GetMapping("/{id}/alerts")
    public ResponseEntity<List<AlertDTO>> getAlerts(
        @PathVariable UUID id,
        @RequestParam(required = false) AlertType type,
        @RequestParam(required = false) AlertPriority priority,
        @RequestParam(defaultValue = "false") boolean onlyUnread) {

        List<AlertDTO> alerts = alertService.getAlerts(id, type, priority, onlyUnread);
        return ResponseEntity.ok(alerts);
    }

    @GetMapping("/{id}/analytics/top-sellers")
    public ResponseEntity<List<TopSellerDTO>> getTopSellers(
        @PathVariable UUID id,
        @RequestParam(defaultValue = "10") int limit,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        List<TopSellerDTO> topSellers = analyticsService.getTopSellers(id, limit, startDate, endDate);
        return ResponseEntity.ok(topSellers);
    }

    @GetMapping("/{id}/analytics/market-basket")
    public ResponseEntity<List<MarketBasketDTO>> getMarketBasketAnalysis(
        @PathVariable UUID id,
        @RequestParam(defaultValue = "0.01") double minSupport,
        @RequestParam(defaultValue = "0.5") double minConfidence) {

        List<MarketBasketDTO> analysis = analyticsService.getMarketBasketAnalysis(id, minSupport, minConfidence);
        return ResponseEntity.ok(analysis);
    }
}
