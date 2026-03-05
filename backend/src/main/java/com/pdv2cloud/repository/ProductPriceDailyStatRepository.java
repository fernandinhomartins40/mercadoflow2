package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ProductPriceDailyStat;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface ProductPriceDailyStatRepository extends JpaRepository<ProductPriceDailyStat, UUID> {
    boolean existsByMarket_IdAndProduct_Id(UUID marketId, UUID productId);

    @Transactional
    @Modifying
    @Query("delete from ProductPriceDailyStat s where s.market.id = :marketId and s.product.id = :productId")
    void deleteByMarketIdAndProductId(@Param("marketId") UUID marketId, @Param("productId") UUID productId);

    List<ProductPriceDailyStat> findByMarket_IdAndProduct_IdOrderByStatDateAsc(UUID marketId, UUID productId);

    List<ProductPriceDailyStat> findByMarket_IdAndProduct_IdAndStatDateBetweenOrderByStatDateAsc(
        UUID marketId,
        UUID productId,
        LocalDate startDate,
        LocalDate endDate
    );
}
