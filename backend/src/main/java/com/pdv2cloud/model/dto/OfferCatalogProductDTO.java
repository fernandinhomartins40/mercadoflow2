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
public class OfferCatalogProductDTO {
    private UUID productId;
    private String ean;
    private String name;
    private String brand;
    private String category;
    private String unit;
    private String packageDescription;
    private String imageUrl;
    private BigDecimal currentPrice;
    private BigDecimal baselinePrice;
    private LocalDateTime lastSoldAt;
    private String productUrl;
}

