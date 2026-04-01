package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record StatePriceImportResponseDTO(
    UUID sourceId,
    String provider,
    String name,
    long createdProducts,
    long importedObservations,
    long skippedObservations,
    long errors,
    LocalDateTime latestObservedAt
) {
}
