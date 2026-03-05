package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ProductObservation;
import com.pdv2cloud.repository.projection.ProductObservationSnapshot;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductObservationRepository extends JpaRepository<ProductObservation, UUID> {
    boolean existsByInvoiceItem_Id(UUID invoiceItemId);

    @Query(
        "select po.id as id, po.invoice.id as invoiceId, po.observedAt as observedAt, " +
        "po.quantity as quantity, po.unitPrice as unitPrice, po.netUnitPrice as netUnitPrice, " +
        "po.totalPrice as totalPrice, po.netTotalPrice as netTotalPrice " +
        "from ProductObservation po " +
        "where po.market.id = :marketId and po.product.id = :productId " +
        "order by po.observedAt asc, po.id asc"
    )
    List<ProductObservationSnapshot> findSnapshotsByMarketIdAndProductIdOrderByObservedAtAsc(
        @Param("marketId") UUID marketId,
        @Param("productId") UUID productId
    );

    @Query(
        "select distinct po.product.id from ProductObservation po " +
        "where po.market.id = :marketId"
    )
    List<UUID> findDistinctProductIdsByMarketId(
        @Param("marketId") UUID marketId
    );

    @Query(
        "select distinct po.product.id from ProductObservation po " +
        "where po.market.id = :marketId and po.observedAt > :after"
    )
    List<UUID> findDistinctProductIdsByMarketIdAndObservedAtAfter(
        @Param("marketId") UUID marketId,
        @Param("after") LocalDateTime after
    );

    @Query(
        "select max(po.observedAt) from ProductObservation po " +
        "where po.market.id = :marketId"
    )
    LocalDateTime findMaxObservedAtByMarketId(
        @Param("marketId") UUID marketId
    );

    @Query(
        "select max(po.observedAt) from ProductObservation po " +
        "where po.market.id = :marketId and po.observedAt > :after"
    )
    LocalDateTime findMaxObservedAtByMarketIdAndObservedAtAfter(
        @Param("marketId") UUID marketId,
        @Param("after") LocalDateTime after
    );

    @Query(
        "select distinct po.product.id from ProductObservation po " +
        "where po.market.id = :marketId and not exists (" +
        "select 1 from ProductPriceDailyStat s " +
        "where s.market.id = po.market.id and s.product.id = po.product.id" +
        ")"
    )
    List<UUID> findDistinctProductIdsByMarketIdWithoutDailyStats(
        @Param("marketId") UUID marketId
    );
}
