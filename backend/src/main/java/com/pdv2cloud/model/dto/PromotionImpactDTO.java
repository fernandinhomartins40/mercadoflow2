package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PromotionImpactDTO {
    private UUID productId;
    private String name;
    private String category;
    private String imageUrl;
    private BigDecimal baselinePrice;
    private BigDecimal promoAveragePrice;
    private BigDecimal normalAveragePrice;
    private BigDecimal promoRevenue;
    private BigDecimal normalRevenue;
    private BigDecimal promoQuantity;
    private BigDecimal normalQuantity;
    private Double quantityLiftPercent;
    private Double revenueLiftPercent;
}
