package com.pdv2cloud.model.dto;

import java.time.LocalDateTime;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CatalogWebImportResponseDTO {
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
    private int requestedPagesPerSource;
    private int pageSize;
    private int scannedProducts;
    private int importedProducts;
    private int skippedInvalidGtin;
    private int skippedMissingName;
    private int skippedMedication;
    private int skippedDuplicateGtin;
    private int errors;
    private List<CatalogImportSourceResultDTO> sources;
}
