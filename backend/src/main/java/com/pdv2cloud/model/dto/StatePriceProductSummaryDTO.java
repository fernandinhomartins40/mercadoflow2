package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

public record StatePriceProductSummaryDTO(
    UUID productId,
    String gtin,
    String productName,
    String brand,
    String category,
    String packageDescription,
    String unit,
    long observationCount,
    long sourceCount,
    long stateCount,
    BigDecimal lowestPrice,
    BigDecimal highestPrice,
    BigDecimal averagePrice,
    String bestState,
    String bestCity,
    String bestStore,
    String bestSourceName,
    String bestSourceProvider,
    BigDecimal bestPrice,
    LocalDateTime bestObservedAt,
    String worstState,
    String worstCity,
    String worstStore,
    String worstSourceName,
    String worstSourceProvider,
    BigDecimal worstPrice,
    LocalDateTime worstObservedAt,
    LocalDateTime latestObservedAt
) {
}
