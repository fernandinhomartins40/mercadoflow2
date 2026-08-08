package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Índice sazonal de venda por período (ver V31__working_capital_intelligence.sql).
 *
 * {@code seasonalIndex} = 1.0 significa venda na média do produto; 1.4 indica
 * 40% acima. Alimenta a sugestão de compra (comprar antes do pico) e a escolha
 * da janela de promoção (descontar quando o produto já vende sozinho costuma
 * ser desperdício de margem).
 */
@Entity
@Table(name = "product_seasonality")
@Data
@NoArgsConstructor
public class ProductSeasonality {

    /** Granularidade do índice. */
    public enum PeriodType {
        /** Dia da semana, 0=domingo .. 6=sábado. */
        DOW,
        /** Mês do ano, 1..12. */
        MONTH
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

    @Enumerated(EnumType.STRING)
    @Column(name = "period_type", nullable = false, length = 8)
    private PeriodType periodType;

    @Column(name = "period_index", nullable = false)
    private Integer periodIndex;

    @Column(name = "seasonal_index", nullable = false)
    private BigDecimal seasonalIndex = BigDecimal.ONE;

    @Column(nullable = false)
    private Integer observations = 0;

    @Column(nullable = false)
    private BigDecimal confidence = BigDecimal.ZERO;

    @Column(name = "window_days", nullable = false)
    private Integer windowDays = 365;

    @Column(name = "computed_at", nullable = false)
    private LocalDateTime computedAt = LocalDateTime.now();
}
