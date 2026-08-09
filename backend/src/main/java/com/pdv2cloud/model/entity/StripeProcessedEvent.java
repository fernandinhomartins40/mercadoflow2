package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Evento de webhook já processado (ver V35__stripe_billing.sql).
 *
 * O Stripe reenvia webhooks até receber 2xx e não garante entrega única. Sem
 * este registro, um reenvio poderia reaplicar uma mudança de plano já
 * revertida — por exemplo, rebaixar uma conta que voltou a ficar ativa.
 *
 * A chave primária é o próprio id do evento no Stripe: a checagem de duplicata
 * vira um lookup por PK.
 */
@Entity
@Table(name = "stripe_processed_events")
@Data
@NoArgsConstructor
public class StripeProcessedEvent {

    @Id
    @Column(name = "event_id", length = 64)
    private String eventId;

    @Column(name = "event_type", nullable = false, length = 64)
    private String eventType;

    @Column(name = "market_id")
    private UUID marketId;

    @Column(name = "processed_at", nullable = false)
    private LocalDateTime processedAt = LocalDateTime.now();
}
