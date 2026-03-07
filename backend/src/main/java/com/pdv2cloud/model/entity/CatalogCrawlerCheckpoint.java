package com.pdv2cloud.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(
    name = "catalog_crawler_checkpoints",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_catalog_crawler_checkpoint_scope",
        columnNames = {"provider", "scope_type", "scope_key"}
    ),
    indexes = {
        @Index(name = "idx_catalog_crawler_checkpoint_provider_status", columnList = "provider,status,updated_at"),
        @Index(name = "idx_catalog_crawler_checkpoint_provider_type_status", columnList = "provider,scope_type,status,updated_at")
    }
)
@Data
@NoArgsConstructor
public class CatalogCrawlerCheckpoint {

    @Id
    private UUID id;

    @Column(nullable = false, length = 64)
    private String provider;

    @Column(name = "scope_type", nullable = false, length = 64)
    private String scopeType;

    @Column(name = "scope_key", nullable = false, length = 512)
    private String scopeKey;

    @Column(name = "scope_hash", length = 128)
    private String scopeHash;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(name = "run_id")
    private UUID runId;

    @Column(name = "item_count", nullable = false)
    private Integer itemCount = 0;

    @Column(name = "metadata_json", columnDefinition = "text")
    private String metadataJson;

    @Column(name = "error_message", columnDefinition = "text")
    private String errorMessage;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "last_seen_at", nullable = false)
    private LocalDateTime lastSeenAt;

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
        if (itemCount == null) {
            itemCount = 0;
        }
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
        if (lastSeenAt == null) {
            lastSeenAt = now;
        }
    }

    @PreUpdate
    public void preUpdate() {
        LocalDateTime now = LocalDateTime.now();
        updatedAt = now;
        if (lastSeenAt == null) {
            lastSeenAt = now;
        }
    }
}
