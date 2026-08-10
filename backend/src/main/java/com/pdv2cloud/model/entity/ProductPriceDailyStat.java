package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
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
    name = "product_price_daily_stats",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_product_price_daily_stats_market_product_date",
        columnNames = {"market_id", "product_id", "stat_date"}
    ),
    indexes = {
        @Index(name = "idx_product_price_daily_stats_market_product_date", columnList = "market_id,product_id,stat_date")
    }
)
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
@NoArgsConstructor
public class ProductPriceDailyStat {
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

    @Column(name = "stat_date", nullable = false)
    private LocalDate statDate;

    @Column(name = "weighted_avg_price", precision = 10, scale = 2, nullable = false)
    private BigDecimal weightedAvgPrice;

    @Column(name = "median_price", precision = 10, scale = 2, nullable = false)
    private BigDecimal medianPrice;

    @Column(name = "min_price", precision = 10, scale = 2, nullable = false)
    private BigDecimal minPrice;

    @Column(name = "max_price", precision = 10, scale = 2, nullable = false)
    private BigDecimal maxPrice;

    @Column(name = "std_dev_price", precision = 10, scale = 4)
    private BigDecimal stdDevPrice;

    @Column(name = "mad_price", precision = 10, scale = 4)
    private BigDecimal madPrice;

    @Column(name = "total_quantity", precision = 12, scale = 3, nullable = false)
    private BigDecimal totalQuantity;

    @Column(name = "total_revenue", precision = 12, scale = 2, nullable = false)
    private BigDecimal totalRevenue;

    @Column(name = "transaction_count", nullable = false)
    private Integer transactionCount;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}

