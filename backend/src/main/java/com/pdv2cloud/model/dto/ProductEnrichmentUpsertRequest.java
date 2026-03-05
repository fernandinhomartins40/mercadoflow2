package com.pdv2cloud.model.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import lombok.Data;

@Data
public class ProductEnrichmentUpsertRequest {
    @NotBlank
    private String gtin;

    @NotBlank
    private String provider;

    private String providerProductId;
    private String canonicalName;
    private String brand;
    private String category;
    private String ncm;
    private String unit;
    private String description;
    private String manufacturer;
    private String packageDescription;
    private String imageUrl;
    private String imageStorageKey;
    private String attributesJson;
    private String rawPayload;
    private String sourceLicense;

    @DecimalMin("0.0")
    @DecimalMax("1.0")
    private BigDecimal confidenceScore;
}
