package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.util.UUID;
import lombok.Data;

@Data
public class RecordPurchaseRequest {
    private UUID productId;           // obrigatório
    private UUID shoppingListItemId;  // opcional — vincula ao item da lista
    private BigDecimal quantityPurchased;
    private BigDecimal unitCost;      // obrigatório
    private BigDecimal unitSalePrice; // opcional
    private String supplierName;
    private String note;
}
