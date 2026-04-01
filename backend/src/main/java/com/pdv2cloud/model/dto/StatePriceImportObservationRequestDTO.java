package com.pdv2cloud.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class StatePriceImportObservationRequestDTO {
    @NotBlank
    private String productName;

    private String gtin;
    private String brand;
    private String category;
    private String packageDescription;
    private String unit;

    @NotBlank
    private String observedState;

    private String observedCity;
    private String observedStore;
    private String observedStoreId;
    private String providerProductId;
    private String sourceUrl;

    @NotNull
    private BigDecimal price;

    private String currency = "BRL";
    private LocalDateTime observedAt;
    private String rawPayload;
}
