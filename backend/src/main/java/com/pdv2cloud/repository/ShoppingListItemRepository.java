package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ShoppingListItem;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ShoppingListItemRepository extends JpaRepository<ShoppingListItem, UUID> {
    @Query("""
        select sli
        from ShoppingListItem sli
        join fetch sli.product p
        where sli.market.id = :marketId
        order by sli.isChecked asc, sli.updatedAt desc, p.name asc
        """)
    List<ShoppingListItem> findDetailedByMarketId(@Param("marketId") UUID marketId);

    Optional<ShoppingListItem> findByIdAndMarketId(UUID id, UUID marketId);

    Optional<ShoppingListItem> findByMarketIdAndProductId(UUID marketId, UUID productId);

    long countByMarketIdAndIsChecked(UUID marketId, Boolean isChecked);
}
