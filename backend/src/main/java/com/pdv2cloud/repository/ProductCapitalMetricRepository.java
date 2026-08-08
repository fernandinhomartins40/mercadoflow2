package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ProductCapitalMetric;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductCapitalMetricRepository extends JpaRepository<ProductCapitalMetric, UUID> {

    @Query("select m from ProductCapitalMetric m "
        + "join fetch m.product "
        + "where m.market.id = :marketId "
        + "order by m.priorityScore desc nulls last")
    List<ProductCapitalMetric> findByMarketOrderByPriority(@Param("marketId") UUID marketId);

    @Query("select m from ProductCapitalMetric m "
        + "join fetch m.product "
        + "where m.market.id = :marketId and m.capitalStatus = :status "
        + "order by m.priorityScore desc nulls last")
    List<ProductCapitalMetric> findByMarketAndStatus(
        @Param("marketId") UUID marketId,
        @Param("status") ProductCapitalMetric.CapitalStatus status
    );

    Optional<ProductCapitalMetric> findByMarketIdAndProductId(UUID marketId, UUID productId);

    @Modifying
    @Query("delete from ProductCapitalMetric m where m.market.id = :marketId")
    void deleteByMarketId(@Param("marketId") UUID marketId);
}
