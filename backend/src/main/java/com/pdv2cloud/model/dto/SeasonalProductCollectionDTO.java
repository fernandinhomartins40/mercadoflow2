package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SeasonalProductCollectionDTO {
    private String key;
    private String title;
    private String subtitle;
    private String periodLabel;
    private String proximityLabel;
    private String status;
    private BigDecimal totalRevenue;
    private BigDecimal totalQuantity;
    private Long totalTransactions;
    private List<ProductPerformanceDTO> products;
}
