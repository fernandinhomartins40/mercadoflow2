package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProductPriceEventDTO {
    private UUID id;
    private LocalDateTime eventAt;
    private BigDecimal oldPrice;
    private BigDecimal newPrice;
    private BigDecimal deltaAmount;
    private BigDecimal deltaPercent;
    private String direction;
    private BigDecimal baselinePrice;
    private BigDecimal dynamicThresholdPercent;
    private BigDecimal confidenceScore;
    private String triggerType;
}

