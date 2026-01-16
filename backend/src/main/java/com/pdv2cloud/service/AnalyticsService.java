package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.AlertDTO;
import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.dto.MarketDashboardDTO;
import com.pdv2cloud.model.dto.ProductAnalyticsDTO;
import com.pdv2cloud.model.dto.SalesTrendPointDTO;
import com.pdv2cloud.model.dto.TopSellerDTO;
import com.pdv2cloud.model.entity.Alert;
import com.pdv2cloud.repository.AlertRepository;
import com.pdv2cloud.repository.InvoiceRepository;
import com.pdv2cloud.repository.SalesAnalyticsRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
public class AnalyticsService {

    @Autowired
    private SalesAnalyticsRepository analyticsRepository;

    @Autowired
    private InvoiceRepository invoiceRepository;

    @Autowired
    private AlertRepository alertRepository;

    @Autowired
    private MarketBasketService marketBasketService;

    public MarketDashboardDTO getMarketDashboard(UUID marketId, LocalDate startDate, LocalDate endDate) {
        if (startDate == null) {
            startDate = LocalDate.now().minusDays(30);
        }
        if (endDate == null) {
            endDate = LocalDate.now();
        }

        MarketDashboardDTO dashboard = new MarketDashboardDTO();

        BigDecimal totalRevenue = invoiceRepository.getTotalRevenue(marketId, startDate, endDate);
        dashboard.setTotalRevenue(totalRevenue);

        BigDecimal todayRevenue = invoiceRepository.getTotalRevenue(marketId, LocalDate.now(), LocalDate.now());
        dashboard.setTodayRevenue(todayRevenue);

        LocalDate previousStart = startDate.minusDays(ChronoUnit.DAYS.between(startDate, endDate));
        BigDecimal previousRevenue = invoiceRepository.getTotalRevenue(marketId, previousStart, startDate.minusDays(1));
        double growth = calculateGrowth(totalRevenue, previousRevenue);
        dashboard.setGrowthPercentage(growth);

        List<TopSellerDTO> topSellers = getTopSellers(marketId, 5, startDate, endDate);
        dashboard.setTopSellers(topSellers);

        long unreadAlerts = alertRepository.countByMarketIdAndIsReadFalse(marketId);
        dashboard.setUnreadAlerts(unreadAlerts);

        dashboard.setActiveProducts((int) invoiceRepository.countDistinctProducts(marketId));

        List<SalesTrendPointDTO> salesTrend = analyticsRepository.getSalesTrend(marketId, startDate, endDate);
        dashboard.setSalesTrend(salesTrend);

        List<AlertDTO> recentAlerts = alertRepository.findByMarketId(marketId).stream()
            .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
            .limit(5)
            .map(this::mapAlert)
            .collect(Collectors.toList());
        dashboard.setRecentAlerts(recentAlerts);

        return dashboard;
    }

    public Page<ProductAnalyticsDTO> getProductAnalytics(UUID marketId, String category, Pageable pageable) {
        return analyticsRepository.getProductAnalytics(marketId, category, pageable);
    }

    public List<TopSellerDTO> getTopSellers(UUID marketId, int limit, LocalDate startDate, LocalDate endDate) {
        List<TopSellerDTO> list = invoiceRepository.findTopSellers(marketId, startDate, endDate);
        return list.stream().limit(limit).collect(Collectors.toList());
    }

    public List<MarketBasketDTO> getMarketBasketAnalysis(UUID marketId, double minSupport, double minConfidence) {
        return marketBasketService.analyzeMarketBasket(marketId, minSupport, minConfidence);
    }

    private double calculateGrowth(BigDecimal current, BigDecimal previous) {
        if (previous.compareTo(BigDecimal.ZERO) == 0) {
            return 0;
        }
        return current.subtract(previous)
            .divide(previous, 4, RoundingMode.HALF_UP)
            .multiply(BigDecimal.valueOf(100))
            .doubleValue();
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
}
