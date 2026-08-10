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
    name = "product_price_events",
    indexes = {
        @Index(name = "idx_product_price_events_market_product_event", columnList = "market_id,product_id,event_at")
    }
)
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
@NoArgsConstructor
public class ProductPriceEvent {
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

    @Column(name = "event_at", nullable = false)
    private LocalDateTime eventAt;

    @Column(name = "old_price", precision = 10, scale = 2, nullable = false)
    private BigDecimal oldPrice;

    @Column(name = "new_price", precision = 10, scale = 2, nullable = false)
    private BigDecimal newPrice;

    @Column(name = "delta_amount", precision = 10, scale = 2, nullable = false)
    private BigDecimal deltaAmount;

    @Column(name = "delta_percent", precision = 9, scale = 4, nullable = false)
    private BigDecimal deltaPercent;

    @Enumerated(EnumType.STRING)
    @Column(name = "direction", nullable = false)
    private PriceEventDirection direction;

    @Column(name = "baseline_price", precision = 10, scale = 2, nullable = false)
    private BigDecimal baselinePrice;

    @Column(name = "dynamic_threshold_percent", precision = 9, scale = 4, nullable = false)
    private BigDecimal dynamicThresholdPercent;

    @Column(name = "confidence_score", precision = 5, scale = 4, nullable = false)
    private BigDecimal confidenceScore;

    @Column(name = "trigger_type", nullable = false)
    private String triggerType;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}

