package com.pdv2cloud.model.entity;

import java.time.LocalDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(
    name = "market_product_aliases",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_market_product_alias_name",
            columnNames = {"market_id", "product_id", "normalized_name"}
        )
    }
)
@Data
@NoArgsConstructor
public class MarketProductAlias {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "local_name", nullable = false)
    private String localName;

    @Column(name = "normalized_name", nullable = false)
    private String normalizedName;

    @Column(name = "internal_code")
    private String internalCode;

    @Column(name = "times_seen", nullable = false)
    private Integer timesSeen = 0;

    @Column(name = "first_seen_at", nullable = false)
    private LocalDateTime firstSeenAt;

    @Column(name = "last_seen_at", nullable = false)
    private LocalDateTime lastSeenAt;
}
