package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.SupplierOrder;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record SupplierOrderDTO(
    UUID id,
    UUID supplierId,
    String supplierName,
    String supplierFantasia,
    String supplierCnpj,
    String status,
    String statusLabel,
    String orderNumber,
    LocalDateTime orderDate,
    LocalDateTime sentAt,
    LocalDateTime deliveredAt,
    LocalDateTime cancelledAt,
    String cancelReason,
    BigDecimal totalValue,
    String notes,
    int itemCount,
    List<SupplierOrderItemDTO> items,
    boolean canEdit,
    boolean canSend,
    boolean canReceive,
    boolean canCancel,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    private static final java.util.Map<String, String> LABELS = java.util.Map.of(
        "RASCUNHO",  "Rascunho",
        "ENVIADO",   "Enviado",
        "ENTREGUE",  "Entregue",
        "CANCELADO", "Cancelado"
    );

    public static SupplierOrderDTO from(SupplierOrder o, boolean withItems) {
        List<SupplierOrderItemDTO> itemDTOs = withItems
            ? o.getItems().stream().map(SupplierOrderItemDTO::from).toList()
            : List.of();

        String statusStr = o.getStatus().name();
        return new SupplierOrderDTO(
            o.getId(),
            o.getSupplier().getId(),
            o.getSupplier().getRazaoSocial(),
            o.getSupplier().getNomeFantasia(),
            o.getSupplier().getCnpj(),
            statusStr,
            LABELS.getOrDefault(statusStr, statusStr),
            o.getOrderNumber(),
            o.getOrderDate(),
            o.getSentAt(),
            o.getDeliveredAt(),
            o.getCancelledAt(),
            o.getCancelReason(),
            o.getTotalValue(),
            o.getNotes(),
            o.getItems().size(),
            itemDTOs,
            o.canEdit(),
            o.canSend(),
            o.canReceive(),
            o.canCancel(),
            o.getCreatedAt(),
            o.getUpdatedAt()
        );
    }
}
