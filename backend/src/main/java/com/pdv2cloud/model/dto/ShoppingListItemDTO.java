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
public class ShoppingListItemDTO {
    private UUID id;
    private UUID productId;
    private String ean;
    private String name;
    private String category;
    private String brand;
    private String imageUrl;
    private BigDecimal quantityTarget;
    private String note;
    private String sourceTag;
    private String reasonSummary;
    private Boolean checked;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
