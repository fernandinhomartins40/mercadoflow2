package com.pdv2cloud.model.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "purchase_price_history")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PurchasePriceHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shopping_list_item_id")
    private ShoppingListItem shoppingListItem;

    @Column(name = "quantity_purchased", precision = 14, scale = 3, nullable = false)
    private BigDecimal quantityPurchased = BigDecimal.ONE;

    @Column(name = "unit_cost", precision = 14, scale = 4, nullable = false)
    private BigDecimal unitCost;

    @Column(name = "unit_sale_price", precision = 14, scale = 4)
    private BigDecimal unitSalePrice;

    @Column(name = "margin_percent", precision = 8, scale = 4)
    private BigDecimal marginPercent;

    @Column(name = "supplier_name", length = 255)
    private String supplierName;

    @Column(length = 1000)
    private String note;

    @Column(name = "purchased_at", nullable = false)
    private LocalDateTime purchasedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "supplier_order_id")
    private UUID supplierOrderId;

    @Column(name = "supplier_order_item_id")
    private UUID supplierOrderItemId;
}
