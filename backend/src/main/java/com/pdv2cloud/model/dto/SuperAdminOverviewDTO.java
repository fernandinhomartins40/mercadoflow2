package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class SuperAdminOverviewDTO {
    private long totalUsers;
    private long activeUsers;
    private long blockedUsers;
    private long totalMarkets;
    private long activeMarkets;
    private long totalCatalogProducts;
    private long totalCatalogEnrichments;
}
