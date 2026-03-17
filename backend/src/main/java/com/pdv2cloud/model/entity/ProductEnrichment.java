package com.pdv2cloud.model.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(
    name = "product_enrichments",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_product_enrichments_product", columnNames = "product_id")
    }
)
@Data
@NoArgsConstructor
public class ProductEnrichment {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(nullable = false)
    private String provider;

    @Column(name = "provider_product_id")
    private String providerProductId;

    @Column(name = "canonical_name")
    private String canonicalName;

    private String brand;
    private String category;
    private String ncm;
    private String unit;

    @Column(name = "package_description")
    private String packageDescription;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "image_storage_key")
    private String imageStorageKey;

    private String description;
    private String manufacturer;

    @Column(name = "attributes_json", columnDefinition = "text")
    private String attributesJson;

    @Column(name = "raw_payload", columnDefinition = "text")
    private String rawPayload;

    @Column(name = "source_license")
    private String sourceLicense;

    @Column(name = "confidence_score", precision = 5, scale = 2)
    private BigDecimal confidenceScore;

    @Column(name = "fetched_at", nullable = false)
    private LocalDateTime fetchedAt;

    @Column(name = "last_verified_at")
    private LocalDateTime lastVerifiedAt;
}
