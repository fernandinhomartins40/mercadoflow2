package com.pdv2cloud.model.dto;

import java.util.List;
import lombok.Data;

@Data
public class ProductDashboardDTO {
    private ProductPerformanceDTO overview;
    private ProductSpecSheetDTO specSheet;
    private List<SalesTrendPointDTO> salesTrend;
    private List<SeasonalityPointDTO> weekdaySeasonality;
    private List<ProductBranchPerformanceDTO> branchPerformance;
    private List<ProductPairInsightDTO> relatedPairs;
    private ProductPriceTimelineDTO priceTimeline;
    private List<ProductPriceEventDTO> priceEvents;
    private List<ProductPromotionWindowDTO> promotionWindows;
    private List<ProductSeasonalPerformanceDTO> seasonalPerformance;
    private ProductPurchaseSignalDTO purchaseSignal;
}
