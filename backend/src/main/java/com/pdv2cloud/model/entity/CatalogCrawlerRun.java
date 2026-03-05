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
@Table(name = "catalog_crawler_runs")
@Data
@NoArgsConstructor
public class CatalogCrawlerRun {

    @Id
    private UUID id;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    @Column(nullable = false)
    private String status;

    @Column(name = "scanned_products", nullable = false)
    private Integer scannedProducts = 0;

    @Column(name = "imported_products", nullable = false)
    private Integer importedProducts = 0;

    @Column(name = "skipped_invalid_gtin", nullable = false)
    private Integer skippedInvalidGtin = 0;

    @Column(name = "skipped_missing_name", nullable = false)
    private Integer skippedMissingName = 0;

    @Column(name = "skipped_medication", nullable = false)
    private Integer skippedMedication = 0;

    @Column(name = "skipped_duplicate_gtin", nullable = false)
    private Integer skippedDuplicateGtin = 0;

    @Column(nullable = false)
    private Integer errors = 0;

    @Column(columnDefinition = "text")
    private String message;

    @Column(name = "triggered_by")
    private String triggeredBy;

    @Column(name = "sources_json", columnDefinition = "text")
    private String sourcesJson;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (requestedAt == null) {
            requestedAt = now;
        }
        if (status == null || status.isBlank()) {
            status = "QUEUED";
        }
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

