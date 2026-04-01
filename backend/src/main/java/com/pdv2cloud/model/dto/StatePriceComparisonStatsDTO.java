package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;

public record StatePriceComparisonStatsDTO(
    long totalProducts,
    long totalObservations,
    long totalSources,
    long totalStates,
    LocalDateTime latestObservedAt
) {
}
