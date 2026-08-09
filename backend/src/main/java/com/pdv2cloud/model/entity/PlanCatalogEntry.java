package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Plano configurável pelo painel super admin (ver V36__plan_catalog.sql).
 *
 * Substitui as constantes do enum {@link PlanType} como fonte de verdade de
 * preços e limites: o enum passa a ser apenas a semente inicial e o fallback
 * quando a linha não existir.
 *
 * {@link #stripePriceId} é o elo com o Stripe. Como Price é imutável lá, mudar
 * o valor cria um Price novo e move o anterior para
 * {@link #previousStripePriceId} — assim quem já assina continua no valor
 * contratado até ser migrado de propósito.
 */
@Entity
@Table(name = "plan_catalog")
@Data
@NoArgsConstructor
public class PlanCatalogEntry {

    /** Mesmo nome do enum: FREE, ESSENCIAL, PROFISSIONAL, REDE. */
    @Id
    @Column(length = 24)
    private String code;

    @Column(name = "display_name", nullable = false, length = 80)
    private String displayName;

    @Column(length = 500)
    private String description;

    @Column(name = "monthly_price_cents", nullable = false)
    private Integer monthlyPriceCents = 0;

    // Limites. -1 = sem teto (PlanType.UNLIMITED).

    @Column(name = "monthly_invoice_limit", nullable = false)
    private Integer monthlyInvoiceLimit = 1000;

    @Column(name = "branch_limit", nullable = false)
    private Integer branchLimit = 1;

    @Column(name = "pdv_per_branch_limit", nullable = false)
    private Integer pdvPerBranchLimit = 1;

    @Column(name = "pdv_limit", nullable = false)
    private Integer pdvLimit = 1;

    @Column(name = "user_seat_limit", nullable = false)
    private Integer userSeatLimit = 2;

    @Column(name = "history_retention_days", nullable = false)
    private Integer historyRetentionDays = 90;

    @Column(name = "full_insights", nullable = false)
    private Boolean fullInsights = false;

    // Stripe

    @Column(name = "stripe_product_id", length = 64)
    private String stripeProductId;

    @Column(name = "stripe_price_id", length = 64)
    private String stripePriceId;

    /** Preço anterior, mantido para migrar assinantes depois de um reajuste. */
    @Column(name = "previous_stripe_price_id", length = 64)
    private String previousStripePriceId;

    @Column(name = "price_changed_at")
    private LocalDateTime priceChangedAt;

    /** Se aparece para contratação direta no checkout. */
    @Column(nullable = false)
    private Boolean purchasable = false;

    @Column(name = "display_order", nullable = false)
    private Integer displayOrder = 0;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public PlanType planType() {
        return PlanType.fromString(code);
    }
}
