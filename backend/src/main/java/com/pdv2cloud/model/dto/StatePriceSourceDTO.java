package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record StatePriceSourceDTO(
    UUID id,
    String provider,
    String name,
    String stateCode,
    String serviceName,
    String serviceUrl,
    String coverageStates,
    String notes,
    boolean active,
    long observationCount,
    LocalDateTime latestObservedAt
) {
}
