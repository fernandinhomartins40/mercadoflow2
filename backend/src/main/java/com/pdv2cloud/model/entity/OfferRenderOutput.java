package com.pdv2cloud.model.entity;

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
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "offer_render_outputs")
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferRenderOutput {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_id", nullable = false)
    private OfferGenerationJob job;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "template_id")
    private OfferTemplate template;

    @Column(name = "variant_key", length = 120)
    private String variantKey;

    @Column(name = "output_type", nullable = false, length = 80)
    private String outputType;

    @Column(name = "publish_target", length = 120)
    private String publishTarget;

    @Column(nullable = false, length = 80)
    private String status;

    @Column(name = "file_url", length = 2000)
    private String fileUrl;

    @Column(name = "preview_image_url", length = 2000)
    private String previewImageUrl;

    @Column(name = "error_message", length = 2000)
    private String errorMessage;

    @Column(name = "render_options_json", columnDefinition = "text")
    private String renderOptionsJson;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
