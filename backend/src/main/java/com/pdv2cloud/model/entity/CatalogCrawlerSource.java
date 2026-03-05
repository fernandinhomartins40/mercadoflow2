package com.pdv2cloud.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "catalog_crawler_sources")
@Data
@NoArgsConstructor
public class CatalogCrawlerSource {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String provider;

    @Column(name = "source_license")
    private String sourceLicense;

    @Column(name = "seeds_json", nullable = false, columnDefinition = "text")
    private String seedsJson;

    @Column(name = "allowed_domains_json", nullable = false, columnDefinition = "text")
    private String allowedDomainsJson;

    @Column(name = "product_path_hints_json", nullable = false, columnDefinition = "text")
    private String productPathHintsJson;

    @Column(name = "max_pages", nullable = false)
    private Integer maxPages = 250;

    @Column(name = "max_records", nullable = false)
    private Integer maxRecords = 2500;

    @Column(name = "rate_limit_ms", nullable = false)
    private Integer rateLimitMs = 1000;

    @Column(name = "request_timeout_sec", nullable = false)
    private Integer requestTimeoutSec = 20;

    @Column(name = "is_enabled", nullable = false)
    private Boolean isEnabled = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
