package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.SupplierOrderItem;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

public record SupplierOrderItemDTO(
    UUID id,
    UUID supplierOrderId,
    UUID productId,
    String productName,
    String productCategory,
    String imageUrl,
    BigDecimal quantityRequested,
    BigDecimal quantityReceived,
    String unitType,
    BigDecimal unitsPerPack,
    BigDecimal unitCost,
    BigDecimal unitSalePrice,
    BigDecimal marginPercent,
    BigDecimal subtotal,
    String note,
    LocalDateTime createdAt
) {
    public static SupplierOrderItemDTO from(SupplierOrderItem i) {
        return new SupplierOrderItemDTO(
            i.getId(),
            i.getSupplierOrder().getId(),
            i.getProduct().getId(),
            i.getProduct().getName(),
            i.getProduct().getCategory(),
            i.getProduct().getImageUrl(),
            i.getQuantityRequested(),
            i.getQuantityReceived(),
            i.getUnitType(),
            i.getUnitsPerPack(),
            i.getUnitCost(),
            i.getUnitSalePrice(),
            i.getMarginPercent(),
            i.getSubtotal(),
            i.getNote(),
            i.getCreatedAt()
        );
    }
}
