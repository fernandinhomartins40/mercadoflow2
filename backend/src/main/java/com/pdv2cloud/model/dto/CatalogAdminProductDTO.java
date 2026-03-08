package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CatalogAdminProductDTO {
    private UUID enrichmentId;
    private UUID productId;
    private String gtin;
    private String canonicalName;
    private String brand;
    private String category;
    private String description;
    private String manufacturer;
    private String ncm;
    private String packageDescription;
    private String unit;
    private String imageUrl;
    private String provider;
    private String providerProductId;
    private String sourceLicense;
    private String attributesJson;
    private String rawPayload;
    private BigDecimal confidenceScore;
    private LocalDateTime fetchedAt;
    private LocalDateTime lastVerifiedAt;
    private Integer observationCount;
}
