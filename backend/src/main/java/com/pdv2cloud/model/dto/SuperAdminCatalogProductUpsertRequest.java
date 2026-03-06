package com.pdv2cloud.model.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import lombok.Data;

@Data
public class SuperAdminCatalogProductUpsertRequest {
    private String gtin;

    @NotBlank
    private String name;

    private String brand;
    private String category;
    private String packageDescription;
    private String unit;
    private String imageUrl;
    private String provider = "MANUAL_SUPER_ADMIN";
    private String sourceLicense = "Cadastro manual Super Admin";

    @DecimalMin("0.0")
    @DecimalMax("1.0")
    private BigDecimal confidenceScore;
}
