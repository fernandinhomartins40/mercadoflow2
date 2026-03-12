package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.util.List;
import lombok.Data;

@Data
public class MarketCockpitDTO {
    private BigDecimal totalRevenue;
    private BigDecimal averageTicket;
    private long totalTransactions;
    private int activeProducts;
    private double growthPercentage;
    private BigDecimal promoRevenueShare;
    private long campaignsRunning;
    private List<ProductPerformanceDTO> topProducts;
    private List<ProductPerformanceDTO> slowMovers;
    private List<ProductPerformanceDTO> topTurnoverProducts;
    private List<ProductPerformanceDTO> lowTurnoverProducts;
    private List<ProductPerformanceDTO> replenishmentCandidates;
    private List<ProductPerformanceDTO> promotionCandidates;
    private List<ProductPairInsightDTO> topPairs;
    private List<SeasonalityPointDTO> weekdaySeasonality;
    private List<SeasonalityPointDTO> hourlySeasonality;
    private List<SeasonalityPointDTO> monthlySeasonality;
    private List<PromotionImpactDTO> promotionHighlights;
    private List<SeasonalProductCollectionDTO> seasonalCollections;
    private List<CampaignImpactDTO> campaignImpacts;
    private List<SalesTrendPointDTO> salesTrend;
    private List<RecentInvoiceSummaryDTO> recentInvoices;
    private List<AlertDTO> recentAlerts;
}
