package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.SubscriptionEvent;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SubscriptionEventRepository extends JpaRepository<SubscriptionEvent, UUID> {

    List<SubscriptionEvent> findTop50ByMarketIdOrderByCreatedAtDesc(UUID marketId);

    @Query("select e from SubscriptionEvent e join fetch e.market order by e.createdAt desc")
    Page<SubscriptionEvent> findAllWithMarket(Pageable pageable);

    @Query("select e from SubscriptionEvent e join fetch e.market "
        + "where e.eventType = :eventType order by e.createdAt desc")
    Page<SubscriptionEvent> findByEventType(
        @Param("eventType") SubscriptionEvent.EventType eventType,
        Pageable pageable
    );
}
