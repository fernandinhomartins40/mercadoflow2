package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ProductHaloEffect;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductHaloEffectRepository extends JpaRepository<ProductHaloEffect, UUID> {

    /** Produtos que mais tracionam a cesta quando entram em promoção. */
    @Query("select h from ProductHaloEffect h "
        + "join fetch h.driverProduct join fetch h.targetProduct "
        + "where h.market.id = :marketId and h.haloLiftPercent > 0 "
        + "order by h.incrementalRevenue desc nulls last")
    List<ProductHaloEffect> findPositiveByMarket(@Param("marketId") UUID marketId);

    @Query("select h from ProductHaloEffect h "
        + "join fetch h.driverProduct join fetch h.targetProduct "
        + "where h.market.id = :marketId and h.driverProduct.id = :driverId "
        + "order by h.haloLiftPercent desc nulls last")
    List<ProductHaloEffect> findByMarketAndDriver(
        @Param("marketId") UUID marketId,
        @Param("driverId") UUID driverId
    );

    @Modifying
    @Query("delete from ProductHaloEffect h where h.market.id = :marketId")
    void deleteByMarketId(@Param("marketId") UUID marketId);
}
