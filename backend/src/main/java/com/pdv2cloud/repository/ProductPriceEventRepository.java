package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ProductPriceEvent;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface ProductPriceEventRepository extends JpaRepository<ProductPriceEvent, UUID> {
    @Transactional
    @Modifying
    @Query("delete from ProductPriceEvent e where e.market.id = :marketId and e.product.id = :productId")
    void deleteByMarketIdAndProductId(@Param("marketId") UUID marketId, @Param("productId") UUID productId);

    List<ProductPriceEvent> findByMarket_IdAndProduct_IdOrderByEventAtAsc(UUID marketId, UUID productId);

    List<ProductPriceEvent> findByMarket_IdAndProduct_IdAndEventAtBetweenOrderByEventAtAsc(
        UUID marketId,
        UUID productId,
        LocalDateTime startAt,
        LocalDateTime endAt
    );
}

