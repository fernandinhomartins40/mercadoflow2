package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class PurchasePriceHistoryDTO {
    private UUID id;
    private UUID productId;
    private String productName;
    private UUID shoppingListItemId;
    private BigDecimal quantityPurchased;
    private BigDecimal unitCost;
    private BigDecimal unitSalePrice;
    private BigDecimal marginPercent;
    private String supplierName;
    private String note;
    private LocalDateTime purchasedAt;

    // Comparação com entrada anterior (calculada no service)
    private BigDecimal previousUnitCost;
    private BigDecimal costDeltaPercent;     // positivo = ficou mais caro, negativo = mais barato
    private String costTrend;               // UP, DOWN, STABLE, FIRST
}
