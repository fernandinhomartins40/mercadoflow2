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
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * equals/hashCode/toString apenas pelo id.
 *
 * O @Data do Lombok inclui todos os campos, e relacionamentos bidirecionais
 * fazem o hashCode de uma entidade chamar o da outra em ciclo — foi o que
 * derrubou a ingestao de notas com StackOverflowError. Comparar entidade JPA
 * pelo id tambem evita tocar em colecao lazy so para calcular igualdade.
 */
@Entity
@Table(name = "offer_market_profiles")
@EntityListeners(AuditingEntityListener.class)
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
@NoArgsConstructor
@AllArgsConstructor
public class OfferMarketProfile {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @EqualsAndHashCode.Include
    @ToString.Include
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
