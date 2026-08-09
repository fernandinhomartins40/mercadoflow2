package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.StripeProcessedEvent;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StripeProcessedEventRepository extends JpaRepository<StripeProcessedEvent, String> {

    /** Poda o histórico: reenvios do Stripe só acontecem por poucos dias. */
    @Modifying
    @Query("delete from StripeProcessedEvent e where e.processedAt < :before")
    int deleteOlderThan(@Param("before") LocalDateTime before);
}
