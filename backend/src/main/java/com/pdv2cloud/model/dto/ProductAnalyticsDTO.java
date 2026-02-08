package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ProductAnalyticsDTO {
    private UUID productId;
    private String name;
    private String category;
    private BigDecimal revenue;
    private BigDecimal quantitySold;
    // JPQL avg(...) returns Double for numeric columns in most providers (Hibernate included).
    private Double averagePrice;

    // JPQL sum(long) returns Long.
    private Long transactionCount;
}
