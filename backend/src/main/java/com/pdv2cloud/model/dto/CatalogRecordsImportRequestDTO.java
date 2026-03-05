package com.pdv2cloud.model.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.math.BigDecimal;
import java.util.List;
import lombok.Data;

@Data
public class CatalogRecordsImportRequestDTO {
    @NotBlank
    private String provider;

    private String sourceLicense;

    @DecimalMin("0.0")
    @DecimalMax("1.0")
    private BigDecimal confidenceScore;

    private boolean skipMedication = true;

    @Valid
    @NotEmpty
    private List<CatalogImportRecordDTO> items;
}
