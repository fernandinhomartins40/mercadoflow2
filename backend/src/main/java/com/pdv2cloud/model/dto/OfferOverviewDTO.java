package com.pdv2cloud.model.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferOverviewDTO {
    private long templatesCount;
    private long jobsCount;
    private long queuedJobs;
    private List<OfferTemplateDTO> templates;
    private List<OfferGenerationJobDTO> recentJobs;
    private List<OfferBrandKitDTO> brandKits;
    private List<OfferCampaignKitDTO> campaignKits;
    private List<ProductPerformanceDTO> replenishmentSuggestions;
    private List<ProductPerformanceDTO> seasonalSuggestions;
    private List<PromotionImpactDTO> promotionSuggestions;
    private List<ProductPairInsightDTO> pairSuggestions;
}

