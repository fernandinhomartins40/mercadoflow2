package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ProductInventoryEstimate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductInventoryEstimateRepository extends JpaRepository<ProductInventoryEstimate, UUID> {

    List<ProductInventoryEstimate> findByMarketId(UUID marketId);

    Optional<ProductInventoryEstimate> findByMarketIdAndProductId(UUID marketId, UUID productId);

    @Modifying
    @Query("delete from ProductInventoryEstimate e where e.market.id = :marketId")
    void deleteByMarketId(@Param("marketId") UUID marketId);
}
