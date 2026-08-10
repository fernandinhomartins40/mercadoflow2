package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.ToString;

/**
 * equals/hashCode/toString apenas pelo id.
 *
 * O @Data do Lombok inclui todos os campos, e relacionamentos bidirecionais
 * fazem o hashCode de uma entidade chamar o da outra em ciclo — foi o que
 * derrubou a ingestao de notas com StackOverflowError. Comparar entidade JPA
 * pelo id tambem evita tocar em colecao lazy so para calcular igualdade.
 */
@Entity
@Table(
    name = "product_promotion_windows",
    indexes = {
        @Index(name = "idx_product_promotion_windows_market_product_start", columnList = "market_id,product_id,start_at")
    }
)
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
@NoArgsConstructor
public class ProductPromotionWindow {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @EqualsAndHashCode.Include
    @ToString.Include
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "start_at", nullable = false)
    private LocalDateTime startAt;

    @Column(name = "end_at")
    private LocalDateTime endAt;

    @Column(name = "baseline_price", precision = 10, scale = 2, nullable = false)
    private BigDecimal baselinePrice;

    @Column(name = "promo_price", precision = 10, scale = 2, nullable = false)
    private BigDecimal promoPrice;

    @Column(name = "discount_percent", precision = 9, scale = 4, nullable = false)
    private BigDecimal discountPercent;

    @Column(name = "quantity_lift_percent", precision = 9, scale = 4, nullable = false)
    private BigDecimal quantityLiftPercent;

    @Column(name = "revenue_lift_percent", precision = 9, scale = 4, nullable = false)
    private BigDecimal revenueLiftPercent;

    @Column(name = "dynamic_threshold_percent", precision = 9, scale = 4, nullable = false)
    private BigDecimal dynamicThresholdPercent;

    @Column(name = "confidence_score", precision = 5, scale = 4, nullable = false)
    private BigDecimal confidenceScore;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private PromotionWindowStatus status;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}

