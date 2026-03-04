package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ProductPromotionWindow;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface ProductPromotionWindowRepository extends JpaRepository<ProductPromotionWindow, UUID> {
    @Transactional
    @Modifying
    @Query("delete from ProductPromotionWindow w where w.market.id = :marketId and w.product.id = :productId")
    void deleteByMarketIdAndProductId(@Param("marketId") UUID marketId, @Param("productId") UUID productId);

    List<ProductPromotionWindow> findByMarket_IdAndProduct_IdOrderByStartAtAsc(UUID marketId, UUID productId);

    List<ProductPromotionWindow> findByMarket_IdAndProduct_IdAndStartAtBetweenOrderByStartAtAsc(
        UUID marketId,
        UUID productId,
        LocalDateTime startAt,
        LocalDateTime endAt
    );
}

