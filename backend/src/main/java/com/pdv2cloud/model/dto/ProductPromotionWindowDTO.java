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
public class ProductPromotionWindowDTO {
    private UUID id;
    private LocalDateTime startAt;
    private LocalDateTime endAt;
    private BigDecimal baselinePrice;
    private BigDecimal promoPrice;
    private BigDecimal discountPercent;
    private BigDecimal quantityLiftPercent;
    private BigDecimal revenueLiftPercent;
    private BigDecimal dynamicThresholdPercent;
    private BigDecimal confidenceScore;
    private String status;
}

