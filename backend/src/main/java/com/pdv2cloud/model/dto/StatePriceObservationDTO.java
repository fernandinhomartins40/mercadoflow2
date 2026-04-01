package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

public record StatePriceObservationDTO(
    UUID observationId,
    UUID sourceId,
    String sourceProvider,
    String sourceName,
    String serviceUrl,
    UUID productId,
    String providerProductId,
    String observedGtin,
    String productName,
    String normalizedName,
    String brand,
    String category,
    String packageDescription,
    String unit,
    String observedState,
    String observedCity,
    String observedStore,
    String observedStoreId,
    String sourceUrl,
    BigDecimal price,
    String currency,
    LocalDateTime observedAt
) {
}
