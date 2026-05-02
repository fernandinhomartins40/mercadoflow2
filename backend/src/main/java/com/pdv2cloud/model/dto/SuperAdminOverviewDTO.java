package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class SuperAdminOverviewDTO {
    private long totalUsers;
    private long activeUsers;
    private long blockedUsers;
    private long orphanUsers;
    private long totalMarkets;
    private long activeMarkets;
    private long pendingMarkets;
    private long trialMarkets;
    private long pastDueMarkets;
    private long suspendedMarkets;
    private long expiringMarkets;
    private long seatLimitTotal;
    private long seatUsedTotal;
    private long totalCatalogProducts;
    private long totalCatalogEnrichments;
}
