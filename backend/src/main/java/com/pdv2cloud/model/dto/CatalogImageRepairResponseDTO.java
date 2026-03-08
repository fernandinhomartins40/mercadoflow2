package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CatalogImageRepairResponseDTO {
    private String provider;
    private String triggeredBy;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
    private int batchSize;
    private int maxItems;
    private int scannedEnrichments;
    private int alreadyPresent;
    private int attemptedRepairs;
    private int repairedImages;
    private int failedRepairs;
    private boolean completed;
    private String message;
}
