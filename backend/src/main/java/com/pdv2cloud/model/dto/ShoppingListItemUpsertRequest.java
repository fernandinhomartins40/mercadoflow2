package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.util.UUID;
import lombok.Data;

@Data
public class ShoppingListItemUpsertRequest {
    private UUID productId;
    private BigDecimal quantityTarget;
    private String note;
    private String sourceTag;
    private String reasonSummary;
    private Boolean checked;
}
