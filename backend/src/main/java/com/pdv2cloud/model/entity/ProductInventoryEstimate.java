package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Estoque teórico de um produto (ver V31__working_capital_intelligence.sql).
 *
 * O sistema não tem inventário físico: o saldo é derivado das entradas
 * registradas menos as saídas apuradas nas notas fiscais. Por isso todo
 * consumo deste dado deve levar {@link #confidenceScore} junto — um saldo com
 * confiança baixa não sustenta decisão de compra sozinho.
 */
@Entity
@Table(name = "product_inventory_estimates")
@Data
@NoArgsConstructor
public class ProductInventoryEstimate {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "estimated_units", nullable = false)
    private BigDecimal estimatedUnits = BigDecimal.ZERO;

    @Column(name = "estimated_cost_value", nullable = false)
    private BigDecimal estimatedCostValue = BigDecimal.ZERO;

    @Column(name = "total_purchased_units", nullable = false)
    private BigDecimal totalPurchasedUnits = BigDecimal.ZERO;

    @Column(name = "total_sold_units", nullable = false)
    private BigDecimal totalSoldUnits = BigDecimal.ZERO;

    /** 0..1 — quanto o saldo estimado merece crédito. */
    @Column(name = "confidence_score", nullable = false)
    private BigDecimal confidenceScore = BigDecimal.ZERO;

    @Column(name = "confidence_reason", length = 64)
    private String confidenceReason;

    @Column(name = "last_purchase_at")
    private LocalDateTime lastPurchaseAt;

    @Column(name = "last_sale_at")
    private LocalDateTime lastSaleAt;

    @Column(name = "computed_at", nullable = false)
    private LocalDateTime computedAt = LocalDateTime.now();
}
