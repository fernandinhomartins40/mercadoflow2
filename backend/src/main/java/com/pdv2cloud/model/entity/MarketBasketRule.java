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
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "market_basket_rules")
@Data
@NoArgsConstructor
public class MarketBasketRule {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @Column(name = "computed_at", nullable = false)
    private LocalDateTime computedAt;

    @Column(nullable = false)
    private String antecedent;

    @Column(nullable = false)
    private String consequent;

    @Column(precision = 10, scale = 6)
    private BigDecimal support;

    @Column(precision = 10, scale = 6)
    private BigDecimal confidence;

    @Column(precision = 10, scale = 6)
    private BigDecimal lift;
}

