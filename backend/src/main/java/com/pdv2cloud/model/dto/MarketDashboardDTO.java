package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.util.List;
import lombok.Data;

@Data
public class MarketDashboardDTO {
    private BigDecimal totalRevenue;
    private BigDecimal todayRevenue;
    private double growthPercentage;
    private int activeProducts;
    private long unreadAlerts;
    private List<TopSellerDTO> topSellers;
    private List<SalesTrendPointDTO> salesTrend;
    private List<AlertDTO> recentAlerts;
}
