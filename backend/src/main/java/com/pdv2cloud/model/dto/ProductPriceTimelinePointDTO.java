package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProductPriceTimelinePointDTO {
    private LocalDate date;
    private BigDecimal weightedAveragePrice;
    private BigDecimal medianPrice;
    private BigDecimal minPrice;
    private BigDecimal maxPrice;
    private BigDecimal stdDevPrice;
    private BigDecimal madPrice;
    private BigDecimal totalQuantity;
    private BigDecimal totalRevenue;
    private Integer transactionCount;
}

