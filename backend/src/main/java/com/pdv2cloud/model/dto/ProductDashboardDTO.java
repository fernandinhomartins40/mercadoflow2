package com.pdv2cloud.model.dto;

import java.util.List;
import lombok.Data;

@Data
public class ProductDashboardDTO {
    private ProductPerformanceDTO overview;
    private List<SalesTrendPointDTO> salesTrend;
    private List<SeasonalityPointDTO> weekdaySeasonality;
    private List<ProductBranchPerformanceDTO> branchPerformance;
    private List<ProductPairInsightDTO> relatedPairs;
}
