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
@Table(name = "offer_template_variants")
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferTemplateVariant {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "template_id", nullable = false)
    private OfferTemplate template;

    @Column(name = "variant_key", nullable = false, length = 120)
    private String variantKey;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(name = "canvas_width", nullable = false)
    private Integer canvasWidth;

    @Column(name = "canvas_height", nullable = false)
    private Integer canvasHeight;

    @Column(name = "variant_json", nullable = false, columnDefinition = "text")
    private String variantJson;

    @Column(name = "preview_image_url", length = 2000)
    private String previewImageUrl;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
