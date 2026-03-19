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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "offer_market_profiles")
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OfferMarketProfile {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false, unique = true)
    private Market market;

    @Column(name = "footer_content", length = 600)
    private String footerContent;

    @Column(name = "footer_legal_text", length = 2000)
    private String footerLegalText;

    @Column(name = "primary_logo_url", length = 2000)
    private String primaryLogoUrl;

    @Column(name = "primary_logo_storage_key", length = 255)
    private String primaryLogoStorageKey;

    @Column(name = "secondary_logo_url", length = 2000)
    private String secondaryLogoUrl;

    @Column(name = "secondary_logo_storage_key", length = 255)
    private String secondaryLogoStorageKey;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
