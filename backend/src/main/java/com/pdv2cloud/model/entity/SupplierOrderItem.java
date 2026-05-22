package com.pdv2cloud.model.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "supplier_order_items")
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SupplierOrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "supplier_order_id", nullable = false)
    private SupplierOrder supplierOrder;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "quantity_requested", precision = 14, scale = 3, nullable = false)
    private BigDecimal quantityRequested;

    @Column(name = "quantity_received", precision = 14, scale = 3)
    private BigDecimal quantityReceived;

    // "UN", "CX", "KG", "DZ" etc — apenas exibição
    @Column(name = "unit_type", length = 10)
    private String unitType = "UN";

    // Se unitType=CX: quantas unidades tem a caixa (para calcular custo/un)
    @Column(name = "units_per_pack", precision = 10, scale = 3)
    private BigDecimal unitsPerPack;

    @Column(name = "unit_cost", precision = 14, scale = 4, nullable = false)
    private BigDecimal unitCost;

    @Column(name = "unit_sale_price", precision = 14, scale = 4)
    private BigDecimal unitSalePrice;

    @Column(name = "margin_percent", precision = 8, scale = 4)
    private BigDecimal marginPercent;

    @Column(name = "subtotal", precision = 14, scale = 4)
    private BigDecimal subtotal;

    @Column(length = 500)
    private String note;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
