package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.MarketBasketRule;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface MarketBasketRuleRepository extends JpaRepository<MarketBasketRule, UUID> {

    @Query("select max(r.computedAt) from MarketBasketRule r where r.market.id = :marketId")
    LocalDateTime findLatestComputedAt(@Param("marketId") UUID marketId);

    List<MarketBasketRule> findByMarketIdAndComputedAt(UUID marketId, LocalDateTime computedAt);

    @Transactional
    @Modifying
    @Query("delete from MarketBasketRule r where r.market.id = :marketId and r.computedAt < :before")
    void deleteOlderThan(@Param("marketId") UUID marketId, @Param("before") LocalDateTime before);
}
