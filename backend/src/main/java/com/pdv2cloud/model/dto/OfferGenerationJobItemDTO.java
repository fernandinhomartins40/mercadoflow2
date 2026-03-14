package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferGenerationJobItemDTO {
    private UUID id;
    private UUID productId;
    private String productName;
    private String productImageUrl;
    private String productUnit;
    private BigDecimal currentPrice;
    private String status;
    private Integer positionIndex;
    private String bindingJson;
}

