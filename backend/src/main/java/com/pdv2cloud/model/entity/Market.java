package com.pdv2cloud.model.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * equals/hashCode/toString apenas pelo id — ver a nota em {@link User}: o ciclo
 * Market.owner -> User.market -> Market estourava a pilha em toda ingestão.
 * Aqui o risco é maior ainda, porque branches e pdvs são coleções lazy que o
 * @Data percorreria só para calcular igualdade.
 */
@Entity
@Table(name = "markets")
@EntityListeners(AuditingEntityListener.class)
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
@NoArgsConstructor
@AllArgsConstructor
public class Market {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @EqualsAndHashCode.Include
    @ToString.Include
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

    /**
     * Instante do primeiro envio aceito deste mercado.
     *
     * É o divisor entre acervo e operação: nota emitida ANTES disto é carga
     * histórica e não consome cota. Gravado uma única vez e nunca alterado —
     * se pudesse ser reescrito, bastaria reinstalar o agente para zerar a cota.
     */
    @Column(name = "first_ingest_at")
    private java.time.LocalDateTime firstIngestAt;

    /** Emissão da nota mais antiga recebida. Diagnóstico do acervo trazido. */
    @Column(name = "oldest_invoice_date")
    private java.time.LocalDate oldestInvoiceDate;

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

    // ── Cobrança Stripe (ver V35__stripe_billing.sql) ──────────────────────

    /** Cliente no Stripe, reaproveitado entre assinaturas do mesmo mercado. */
    @Column(name = "stripe_customer_id", length = 64)
    private String stripeCustomerId;

    @Column(name = "stripe_subscription_id", length = 64)
    private String stripeSubscriptionId;

    /** Espelho do status no Stripe: active, past_due, canceled, trialing... */
    @Column(name = "stripe_status", length = 32)
    private String stripeStatus;

    @Column(name = "stripe_price_id", length = 64)
    private String stripePriceId;

    /** Fim do período pago: o acesso vale até aqui, mesmo após cancelamento. */
    @Column(name = "current_period_end")
    private LocalDateTime currentPeriodEnd;

    @Column(name = "cancel_at_period_end", nullable = false)
    private Boolean cancelAtPeriodEnd = false;

    // ── CRM comercial (ver V38__commercial_crm.sql) ────────────────────────

    /** Responsável comercial pela conta. */
    @Column(name = "account_owner_email")
    private String accountOwnerEmail;

    /** 0-100, recalculado por job a partir de uso, pagamento e engajamento. */
    @Column(name = "health_score")
    private Integer healthScore;

    @Column(name = "health_updated_at")
    private LocalDateTime healthUpdatedAt;

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
