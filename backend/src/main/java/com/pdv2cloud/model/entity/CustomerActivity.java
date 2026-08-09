package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Linha do tempo de uma conta (ver V38__commercial_crm.sql).
 *
 * Registra tanto o que a equipe fez (ligação, e-mail, anotação) quanto o que o
 * sistema observou (mudança de plano, pagamento, limite atingido). O
 * {@link #automated} separa os dois na interface: sem essa distinção, uma nota
 * escrita à mão se perderia no meio de dezenas de eventos automáticos.
 */
@Entity
@Table(name = "customer_activities")
@Data
@NoArgsConstructor
public class CustomerActivity {

    public enum Type {
        // Registradas por pessoas
        NOTE,
        CALL,
        EMAIL,
        MEETING,
        WHATSAPP,
        // Geradas pelo sistema
        PLAN_CHANGE,
        PAYMENT,
        INVOICE_SENT,
        LIMIT_REACHED,
        SIGNUP
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @Enumerated(EnumType.STRING)
    @Column(name = "activity_type", nullable = false, length = 24)
    private Type activityType;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String body;

    /** True quando gerada pelo sistema, não por uma pessoa. */
    @Column(nullable = false)
    private Boolean automated = false;

    @Column(name = "invoice_id")
    private UUID invoiceId;

    @Column(name = "contract_id")
    private UUID contractId;

    @Column(name = "actor_email")
    private String actorEmail;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
