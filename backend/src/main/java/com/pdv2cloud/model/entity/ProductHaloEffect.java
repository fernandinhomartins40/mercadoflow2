package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Tração cruzada em promoção (ver V31__working_capital_intelligence.sql).
 *
 * Responde à pergunta que separa uma promoção que só dá desconto de uma que
 * puxa a cesta: quando o produto "driver" está em promoção, o "target" vende
 * mais do que costuma vender?
 */
@Entity
@Table(name = "product_halo_effects")
@Data
@NoArgsConstructor
public class ProductHaloEffect {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    /** Produto que entra em promoção. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "driver_product_id", nullable = false)
    private Product driverProduct;

    /** Produto cuja venda é puxada (ou não) pela promoção do driver. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_product_id", nullable = false)
    private Product targetProduct;

    @Column(name = "target_promo_velocity", nullable = false)
    private BigDecimal targetPromoVelocity = BigDecimal.ZERO;

    @Column(name = "target_normal_velocity", nullable = false)
    private BigDecimal targetNormalVelocity = BigDecimal.ZERO;

    @Column(name = "halo_lift_percent")
    private BigDecimal haloLiftPercent;

    @Column(name = "incremental_revenue")
    private BigDecimal incrementalRevenue;

    @Column(name = "co_occurrence_count", nullable = false)
    private Integer coOccurrenceCount = 0;

    @Column(name = "basket_lift")
    private BigDecimal basketLift;

    @Column(name = "promo_days_observed", nullable = false)
    private Integer promoDaysObserved = 0;

    @Column(nullable = false)
    private BigDecimal confidence = BigDecimal.ZERO;

    @Column(name = "window_days", nullable = false)
    private Integer windowDays = 180;

    @Column(name = "computed_at", nullable = false)
    private LocalDateTime computedAt = LocalDateTime.now();
}
