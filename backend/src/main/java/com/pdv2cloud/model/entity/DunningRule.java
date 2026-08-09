package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Regra da régua de cobrança (ver V38__commercial_crm.sql).
 *
 * {@link #daysOffset} conta a partir do vencimento: negativo é lembrete
 * preventivo, zero é no dia, positivo é cobrança de atraso.
 */
@Entity
@Table(name = "dunning_rules")
@Data
@NoArgsConstructor
public class DunningRule {

    public enum Action {
        /** Reenvia a fatura por e-mail pelo Stripe. */
        RESEND_INVOICE,
        /** Abre um follow-up para a equipe. */
        CREATE_TASK,
        /** Registra alerta de alta prioridade no painel. */
        NOTIFY_ADMIN,
        /** Marca a conta como inadimplente (não bloqueia o acesso). */
        MARK_PAST_DUE
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 120)
    private String name;

    /** Dias em relação ao vencimento: -3 = três dias antes; 7 = sete depois. */
    @Column(name = "days_offset", nullable = false)
    private Integer daysOffset;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Action action;

    @Column(length = 500)
    private String message;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
