package com.pdv2cloud.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

/**
 * Produto participante de uma campanha.
 *
 * Sem este vínculo, o impacto de campanha só podia ser medido sobre a receita da
 * loja inteira — qualquer feriado dentro da janela contaminava o número e não
 * havia como atribuir efeito nem medir canibalização.
 *
 * equals/hashCode ficam com a identidade padrão de objeto (não sobrescritos de
 * propósito): entidades com referência mútua e hashCode derivado de associação
 * já derrubaram a ingestão de notas neste projeto.
 */
@Entity
@Table(name = "campaign_products")
@Getter
@Setter
public class CampaignProduct {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "campaign_id", nullable = false)
    private Campaign campaign;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    /** Preço que a campanha promete praticar, quando definido. */
    @Column(name = "target_price")
    private BigDecimal targetPrice;

    /** Desconto prometido, alternativa ao preço-alvo. */
    @Column(name = "target_discount_percent")
    private BigDecimal targetDiscountPercent;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
