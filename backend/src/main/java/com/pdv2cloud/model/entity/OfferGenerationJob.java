package com.pdv2cloud.model.entity;

import java.time.LocalDateTime;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "offer_generation_jobs")
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferGenerationJob {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "template_id")
    private OfferTemplate template;

    @Column(name = "template_name", nullable = false, length = 255)
    private String templateName;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(nullable = false, length = 80)
    private String status;

    @Column(name = "output_type", nullable = false, length = 80)
    private String outputType;

    @Column(name = "generation_mode", nullable = false, length = 80)
    private String generationMode;

    @Column(name = "product_count", nullable = false)
    private Integer productCount = 0;

    @Column(name = "page_count", nullable = false)
    private Integer pageCount = 0;

    @Column(name = "template_snapshot_json", nullable = false, columnDefinition = "text")
    private String templateSnapshotJson;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}

