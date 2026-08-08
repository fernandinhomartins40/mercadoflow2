package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Métricas de capital de giro por produto (ver V31__working_capital_intelligence.sql).
 *
 * Concentra o veredito que a tela de pedidos mostra ao supermercadista: quanto
 * cada real investido no produto retorna (GMROI), quantos dias de venda o
 * estoque cobre, e se vale investir, manter, reduzir ou liquidar.
 */
@Entity
@Table(name = "product_capital_metrics")
@Data
@NoArgsConstructor
public class ProductCapitalMetric {

    /** Veredito acionável de alocação de capital. */
    public enum CapitalStatus {
        /** Gira bem e devolve capital: vale reforçar a compra. */
        INVEST,
        /** Desempenho dentro do esperado: manter o ciclo atual. */
        MANTER,
        /** Capital exposto além do necessário: comprar menos. */
        REDUZIR,
        /** Parado na prateleira: liquidar para liberar caixa. */
        LIQUIDAR
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "window_days", nullable = false)
    private Integer windowDays = 90;

    @Column(nullable = false)
    private BigDecimal revenue = BigDecimal.ZERO;

    @Column(name = "quantity_sold", nullable = false)
    private BigDecimal quantitySold = BigDecimal.ZERO;

    @Column(name = "gross_margin_value")
    private BigDecimal grossMarginValue;

    @Column(name = "gross_margin_percent")
    private BigDecimal grossMarginPercent;

    @Column(name = "unit_cost")
    private BigDecimal unitCost;

    @Column(name = "unit_price")
    private BigDecimal unitPrice;

    /** De onde veio o custo: PURCHASE_HISTORY, SUPPLIER_ORDER ou MARGIN_ESTIMATE. */
    @Column(name = "cost_source", length = 24)
    private String costSource;

    @Column(name = "daily_velocity", nullable = false)
    private BigDecimal dailyVelocity = BigDecimal.ZERO;

    /** Coeficiente de variação da demanda diária — base da classe XYZ. */
    @Column(name = "demand_cv")
    private BigDecimal demandCv;

    @Column(name = "abc_class", length = 1)
    private String abcClass;

    @Column(name = "xyz_class", length = 1)
    private String xyzClass;

    @Column(name = "revenue_share")
    private BigDecimal revenueShare;

    @Column(name = "revenue_cumulative_share")
    private BigDecimal revenueCumulativeShare;

    @Column(name = "inventory_units")
    private BigDecimal inventoryUnits;

    @Column(name = "inventory_value")
    private BigDecimal inventoryValue;

    @Column(name = "coverage_days")
    private BigDecimal coverageDays;

    @Column(name = "gmroi")
    private BigDecimal gmroi;

    @Column(name = "reorder_point_units")
    private BigDecimal reorderPointUnits;

    @Column(name = "suggested_order_units")
    private BigDecimal suggestedOrderUnits;

    @Column(name = "suggested_order_value")
    private BigDecimal suggestedOrderValue;

    @Column(name = "momentum_score")
    private BigDecimal momentumScore;

    /** 0..1 — risco de o produto empacar na prateleira. */
    @Column(name = "stagnation_risk")
    private BigDecimal stagnationRisk;

    @Enumerated(EnumType.STRING)
    @Column(name = "capital_status", length = 16)
    private CapitalStatus capitalStatus;

    @Column(name = "capital_reason", columnDefinition = "text")
    private String capitalReason;

    @Column(name = "priority_score")
    private BigDecimal priorityScore;

    @Column(name = "computed_at", nullable = false)
    private LocalDateTime computedAt = LocalDateTime.now();
}
