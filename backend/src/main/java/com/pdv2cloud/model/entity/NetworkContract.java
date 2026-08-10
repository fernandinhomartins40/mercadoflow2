package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.ToString;

/**
 * Contrato sob medida de uma rede (ver V37__network_contracts_and_invoices.sql).
 *
 * O plano REDE não tem preço de tabela: cada rede negocia valor e limites. Este
 * contrato guarda o que foi combinado e o vincula à assinatura do Stripe que
 * emite as faturas mensais.
 */
/**
 * equals/hashCode/toString apenas pelo id.
 *
 * O @Data do Lombok inclui todos os campos, e relacionamentos bidirecionais
 * fazem o hashCode de uma entidade chamar o da outra em ciclo — foi o que
 * derrubou a ingestao de notas com StackOverflowError. Comparar entidade JPA
 * pelo id tambem evita tocar em colecao lazy so para calcular igualdade.
 */
@Entity
@Table(name = "network_contracts")
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
@NoArgsConstructor
public class NetworkContract {

    public enum Status {
        ACTIVE,
        SUSPENDED,
        ENDED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @EqualsAndHashCode.Include
    @ToString.Include
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @Column(name = "monthly_price_cents", nullable = false)
    private Integer monthlyPriceCents;

    /** Dias entre a emissão da fatura e o vencimento. */
    @Column(name = "days_until_due", nullable = false)
    private Integer daysUntilDue = 15;

    // Limites contratados. -1 = sem teto; nulo herda o override do mercado.

    @Column(name = "invoice_limit")
    private Integer invoiceLimit;

    @Column(name = "branch_limit")
    private Integer branchLimit;

    @Column(name = "pdv_per_branch_limit")
    private Integer pdvPerBranchLimit;

    @Column(name = "pdv_limit")
    private Integer pdvLimit;

    @Column(name = "seat_limit")
    private Integer seatLimit;

    /** Price dedicado a esta rede; não aparece no catálogo público. */
    @Column(name = "stripe_price_id", length = 64)
    private String stripePriceId;

    @Column(name = "stripe_subscription_id", length = 64)
    private String stripeSubscriptionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.ACTIVE;

    @Column(name = "contact_name")
    private String contactName;

    /** Para onde o Stripe envia a fatura. */
    @Column(name = "contact_email")
    private String contactEmail;

    @Column(length = 2000)
    private String notes;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt = LocalDateTime.now();

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
