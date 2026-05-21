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
public class ProductPerformanceDTO {
    private UUID productId;
    private String ean;
    private String name;
    private String category;
    private String imageUrl;
    private BigDecimal revenue;
    private BigDecimal quantitySold;
    private BigDecimal averagePrice;
    private Long transactionCount;
    private Integer salesDays;
    private BigDecimal salesVelocity;
    private BigDecimal promoRevenue;
    private BigDecimal promoQuantity;
    private BigDecimal normalRevenue;
    private BigDecimal normalQuantity;
    private BigDecimal baselinePrice;
    private BigDecimal promoAveragePrice;
    private BigDecimal normalAveragePrice;
    private BigDecimal promoRevenueShare;
    private BigDecimal priceIndex;
    private Double revenueTrendPercentage;
    private LocalDateTime lastSoldAt;
    private String turnoverBand;
    private Double momentumScore;  // EMA(7)/SMA(28) ratio — >1 accelerating, <1 decelerating
    private Double healthScore;    // composite 0-100: revenue trend + velocity + consistency
}
