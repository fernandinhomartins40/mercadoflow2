package com.pdv2cloud.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CatalogImportSourceResultDTO {
    private String provider;
    private String apiBaseUrl;
    private int requestedPages;
    private int fetchedPages;
    private int scannedProducts;
    private int importedProducts;
    private int skippedInvalidGtin;
    private int skippedMissingName;
    private int skippedMedication;
    private int skippedDuplicateGtin;
    private int errors;
}
