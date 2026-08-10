package com.pdv2cloud.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
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
    name = "state_price_observations",
    indexes = {
        @Index(name = "idx_state_price_observations_product_observed_at", columnList = "product_id,observed_at"),
        @Index(name = "idx_state_price_observations_state_observed_at", columnList = "observed_state,observed_at"),
        @Index(name = "idx_state_price_observations_source_observed_at", columnList = "source_id,observed_at"),
        @Index(name = "idx_state_price_observations_price", columnList = "price"),
        @Index(name = "idx_state_price_observations_normalized_name", columnList = "normalized_name")
    }
)
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
@NoArgsConstructor
public class StatePriceObservation {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @EqualsAndHashCode.Include
    @ToString.Include
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_id", nullable = false)
    private StatePriceSource source;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "provider_product_id", nullable = false)
    private String providerProductId;

    @Column(name = "observed_gtin")
    private String observedGtin;

    @Column(name = "product_name", nullable = false)
    private String productName;

    @Column(name = "normalized_name", nullable = false)
    private String normalizedName;

    @Column(name = "brand")
    private String brand;

    @Column(name = "category")
    private String category;

    @Column(name = "package_description")
    private String packageDescription;

    @Column(name = "unit")
    private String unit;

    @Column(name = "observed_state", nullable = false)
    private String observedState;

    @Column(name = "observed_city")
    private String observedCity;

    @Column(name = "observed_store")
    private String observedStore;

    @Column(name = "observed_store_id")
    private String observedStoreId;

    @Column(name = "source_url")
    private String sourceUrl;

    @Column(precision = 10, scale = 2, nullable = false)
    private BigDecimal price;

    @Column(nullable = false)
    private String currency = "BRL";

    @Column(name = "observed_at", nullable = false)
    private LocalDateTime observedAt;

    @Column(name = "raw_payload", columnDefinition = "text")
    private String rawPayload;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
