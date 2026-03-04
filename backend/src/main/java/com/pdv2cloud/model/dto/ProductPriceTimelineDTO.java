package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProductPriceTimelineDTO {
    private BigDecimal dynamicThresholdPercent;
    private BigDecimal firstObservedPrice;
    private BigDecimal lastObservedPrice;
    private LocalDateTime firstVariationAt;
    private LocalDateTime lastVariationAt;
    private BigDecimal maxIncreasePercent;
    private BigDecimal maxDecreasePercent;
    private Integer detectedPromotionWindows;
    private List<ProductPriceTimelinePointDTO> points;
}

