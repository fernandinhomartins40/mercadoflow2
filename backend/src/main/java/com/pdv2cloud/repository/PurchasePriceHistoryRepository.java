package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.PurchasePriceHistory;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PurchasePriceHistoryRepository extends JpaRepository<PurchasePriceHistory, UUID> {

    @Query("""
        select h from PurchasePriceHistory h
        join fetch h.product p
        left join fetch h.shoppingListItem sli
        where h.market.id = :marketId and h.product.id = :productId
        order by h.purchasedAt desc
        """)
    List<PurchasePriceHistory> findByMarketIdAndProductId(
        @Param("marketId") UUID marketId,
        @Param("productId") UUID productId
    );

    @Query("""
        select h from PurchasePriceHistory h
        join fetch h.product p
        left join fetch h.shoppingListItem sli
        where h.market.id = :marketId and h.shoppingListItem.id = :itemId
        order by h.purchasedAt desc
        """)
    List<PurchasePriceHistory> findByMarketIdAndShoppingListItemId(
        @Param("marketId") UUID marketId,
        @Param("itemId") UUID itemId
    );
}
