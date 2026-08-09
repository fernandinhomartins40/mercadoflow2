package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Trilha de alterações de preço (ver V36__plan_catalog.sql).
 *
 * Existe para responder "qual preço vigorava nesta data" — sem isso, uma
 * contestação de cobrança ficaria sem prova documental.
 */
@Entity
@Table(name = "plan_price_history")
@Data
@NoArgsConstructor
public class PlanPriceHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "plan_code", nullable = false, length = 24)
    private String planCode;

    @Column(name = "from_price_cents")
    private Integer fromPriceCents;

    @Column(name = "to_price_cents", nullable = false)
    private Integer toPriceCents;

    @Column(name = "stripe_price_id", length = 64)
    private String stripePriceId;

    /** Assinaturas movidas para o novo preço. Zero = valeu só para novas. */
    @Column(name = "migrated_count", nullable = false)
    private Integer migratedCount = 0;

    @Column(length = 500)
    private String reason;

    @Column(name = "actor_email", length = 255)
    private String actorEmail;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
