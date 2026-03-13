package com.pdv2cloud.model.entity;

import java.math.BigDecimal;
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
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "offer_generation_job_items")
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferGenerationJobItem {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_id", nullable = false)
    private OfferGenerationJob job;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id")
    private Product product;

    @Column(name = "position_index", nullable = false)
    private Integer positionIndex;

    @Column(name = "product_name", nullable = false, length = 500)
    private String productName;

    @Column(name = "product_image_url", length = 2000)
    private String productImageUrl;

    @Column(name = "product_unit", length = 255)
    private String productUnit;

    @Column(name = "current_price", precision = 14, scale = 2)
    private BigDecimal currentPrice;

    @Column(nullable = false, length = 80)
    private String status;

    @Column(name = "binding_json", nullable = false, columnDefinition = "text")
    private String bindingJson;

    @CreatedDate
    private LocalDateTime createdAt;
}

