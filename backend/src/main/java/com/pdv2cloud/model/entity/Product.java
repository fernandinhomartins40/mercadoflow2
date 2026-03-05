package com.pdv2cloud.model.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "products")
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(unique = true)
    private String ean;

    private String name;
    private String normalizedName;
    private String category;
    private String brand;
    private String unit;
    private String packageDescription;
    private String imageUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProductDataSource sourceBest = ProductDataSource.INVOICE;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProductIdentityType identityType = ProductIdentityType.GTIN;

    @Column(precision = 5, scale = 2, nullable = false)
    private BigDecimal confidenceScore = BigDecimal.ZERO;

    private Integer observationCount = 0;
    private LocalDateTime firstSeenAt;
    private LocalDateTime lastSeenAt;
    private LocalDateTime lastVerifiedAt;

    @CreatedDate
    private LocalDateTime createdAt;
}
