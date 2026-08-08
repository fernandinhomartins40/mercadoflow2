package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ProductSeasonality;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductSeasonalityRepository extends JpaRepository<ProductSeasonality, UUID> {

    List<ProductSeasonality> findByMarketIdAndProductId(UUID marketId, UUID productId);

    @Query("select s from ProductSeasonality s "
        + "where s.market.id = :marketId and s.periodType = :periodType "
        + "order by s.seasonalIndex desc")
    List<ProductSeasonality> findByMarketAndPeriodType(
        @Param("marketId") UUID marketId,
        @Param("periodType") ProductSeasonality.PeriodType periodType
    );

    @Modifying
    @Query("delete from ProductSeasonality s where s.market.id = :marketId")
    void deleteByMarketId(@Param("marketId") UUID marketId);
}
