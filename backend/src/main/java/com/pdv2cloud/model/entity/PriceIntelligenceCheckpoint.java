package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "price_intelligence_checkpoints")
@Data
@NoArgsConstructor
public class PriceIntelligenceCheckpoint {
    @Id
    @Column(name = "market_id")
    private UUID marketId;

    @Column(name = "last_observed_at")
    private LocalDateTime lastObservedAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /** Último produto já refeito na rodada em andamento (lotes retomáveis, V81). */
    @Column(name = "cursor_product_id")
    private UUID cursorProductId;

    /** Até onde a rodada em andamento vai: vira o novo checkpoint quando terminar. */
    @Column(name = "target_observed_at")
    private LocalDateTime targetObservedAt;
}

