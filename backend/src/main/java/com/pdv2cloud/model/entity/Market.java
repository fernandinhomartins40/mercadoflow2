package com.pdv2cloud.model.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "markets")
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Market {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(unique = true)
    private String cnpj;

    private String address;
    private String city;
    private String state;
    private String region;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private User owner;

    @Enumerated(EnumType.STRING)
    private PlanType planType;

    @Enumerated(EnumType.STRING)
    private MarketBillingStatus billingStatus = MarketBillingStatus.ACTIVE;

    private Boolean isActive = true;

    private Integer userSeatLimit;

    private LocalDateTime accessExpiresAt;

    private LocalDateTime trialEndsAt;

    // ── Assinatura e limites (ver V33__saas_plans_and_usage.sql) ────────────

    /** Âncora do ciclo mensal de contagem de notas. */
    @Column(name = "billing_cycle_start")
    private LocalDate billingCycleStart;

    /**
     * Sobrescrevem o limite padrão do plano para um cliente específico
     * (negociação, cortesia, piloto). Nulo = usa o limite do plano.
     */
    @Column(name = "invoice_limit_override")
    private Integer invoiceLimitOverride;

    @Column(name = "pdv_limit_override")
    private Integer pdvLimitOverride;

    @Column(name = "seat_limit_override")
    private Integer seatLimitOverride;

    /** Contas internas/demo, isentas de qualquer teto. */
    @Column(name = "is_unlimited", nullable = false)
    private Boolean isUnlimited = false;

    @Column(name = "plan_changed_at")
    private LocalDateTime planChangedAt;

    @Column(name = "plan_notes", length = 1000)
    private String planNotes;

    // ── Rede: matriz e filiais (ver V34__network_and_plan_pricing.sql) ──────

    /**
     * Matriz da rede. Nulo indica que este mercado é a própria matriz (ou uma
     * loja única). A hierarquia tem exatamente dois níveis — o banco impede
     * filial de filial por trigger.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_market_id")
    private Market parentMarket;

    @OneToMany(mappedBy = "parentMarket")
    private List<Market> branches;

    /**
     * Oito primeiros dígitos do CNPJ, idênticos entre filiais da mesma empresa.
     * É o que permite detectar uma rede tentando se cadastrar fatiada.
     */
    @Column(name = "cnpj_root", length = 8)
    private String cnpjRoot;

    /** Rótulo curto da unidade ("Centro", "Filial 2"). */
    @Column(name = "branch_label", length = 120)
    private String branchLabel;

    @Column(name = "branch_limit_override")
    private Integer branchLimitOverride;

    @Column(name = "pdv_per_branch_override")
    private Integer pdvPerBranchOverride;

    /** Preço negociado do plano sob medida, em centavos. */
    @Column(name = "custom_price_cents")
    private Integer customPriceCents;

    /** True quando este mercado é uma filial de outro. */
    public boolean isBranch() {
        return parentMarket != null;
    }

    /** Matriz da rede: o pai quando é filial, ou o próprio mercado. */
    public Market networkRoot() {
        return parentMarket != null ? parentMarket : this;
    }

    private String contactName;

    private String contactEmail;

    private String contactPhone;

    @Column(length = 4000)
    private String notes;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "market", cascade = CascadeType.ALL)
    private List<PDV> pdvs;
}
