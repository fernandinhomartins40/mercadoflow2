package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Trilha de mudanças de plano e cobrança (ver V33__saas_plans_and_usage.sql).
 *
 * Existe para o super admin responder "quem mudou o plano deste cliente,
 * quando e por quê" — inclusive quando a mudança foi automática.
 */
@Entity
@Table(name = "subscription_events")
@Data
@NoArgsConstructor
public class SubscriptionEvent {

    public enum EventType {
        PLAN_CHANGED,
        STATUS_CHANGED,
        LIMIT_OVERRIDE,
        TRIAL_STARTED,
        TRIAL_ENDED,
        /** Gerado pelo sistema quando o mercado atinge o teto do ciclo. */
        LIMIT_REACHED,
        REACTIVATED,
        CANCELLED,
        SIGNUP
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 32)
    private EventType eventType;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_plan", length = 24)
    private PlanType fromPlan;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_plan", length = 24)
    private PlanType toPlan;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 24)
    private MarketBillingStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", length = 24)
    private MarketBillingStatus toStatus;

    @Column(length = 1000)
    private String reason;

    @Column(columnDefinition = "text")
    private String metadata;

    /** Nulo quando o evento foi gerado pelo próprio sistema. */
    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Column(name = "actor_email", length = 255)
    private String actorEmail;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
