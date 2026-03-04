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
public class ProductBranchPerformanceDTO {
    private UUID branchId;
    private String branchName;
    private BigDecimal revenue;
    private BigDecimal quantitySold;
    private BigDecimal averagePrice;
    private Long transactionCount;
    private BigDecimal promoRevenueShare;
    private LocalDateTime lastSoldAt;
}
