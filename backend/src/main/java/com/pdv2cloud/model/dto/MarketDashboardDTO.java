package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
public class MarketDashboardDTO {
    private BigDecimal totalRevenue;
    private BigDecimal todayRevenue;
    private double growthPercentage;
    private int activeProducts;
    private long unreadAlerts;
    private long totalInvoices;
    private long invoicesLast24h;
    private LocalDateTime lastInvoiceProcessedAt;
    private List<TopSellerDTO> topSellers;
    private List<SalesTrendPointDTO> salesTrend;
    private List<AlertDTO> recentAlerts;
    private List<RecentInvoiceSummaryDTO> recentInvoices;
}
