package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.StripeProcessedEvent;
import java.time.LocalDateTime;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StripeProcessedEventRepository extends JpaRepository<StripeProcessedEvent, String> {

    /** Poda o histórico: reenvios do Stripe só acontecem por poucos dias. */
    @Modifying
    @Query("delete from StripeProcessedEvent e where e.processedAt < :before")
    int deleteOlderThan(@Param("before") LocalDateTime before);

    /**
     * Registra o evento ANTES de processar (REC-09): 1 = este pedido ficou com o
     * evento; 0 = outro pedido (reenvio simultâneo ou antigo) já o registrou.
     * A chave primária faz a trava: o segundo insert espera o primeiro e não grava.
     *
     * Nos eventos de assinatura, processed_at guarda o momento do evento no
     * Stripe (event.created, em UTC), para descartar eventos fora de ordem.
     */
    @Modifying
    @Query(value = "insert into stripe_processed_events (event_id, event_type, processed_at) " +
        "values (:id, :type, coalesce(to_timestamp(cast(:createdEpoch as double precision)) at time zone 'UTC', now())) " +
        "on conflict (event_id) do nothing", nativeQuery = true)
    int claim(@Param("id") String eventId, @Param("type") String eventType, @Param("createdEpoch") Long createdEpoch);

    /** event.created (epoch, UTC) do último evento de assinatura já aplicado ao mercado, sem contar o atual. */
    @Query(value = "select cast(extract(epoch from max(processed_at)) as bigint) from stripe_processed_events " +
        "where market_id = :marketId and event_type like 'customer.subscription.%' and event_id <> :id", nativeQuery = true)
    Long lastSubscriptionEventEpoch(@Param("marketId") UUID marketId, @Param("id") String currentEventId);

    /** Marca o evento como aplicado àquele mercado (entra na comparação de ordem). */
    @Modifying
    @Query(value = "update stripe_processed_events set market_id = :marketId where event_id = :id", nativeQuery = true)
    int attachMarket(@Param("id") String eventId, @Param("marketId") UUID marketId);
}
