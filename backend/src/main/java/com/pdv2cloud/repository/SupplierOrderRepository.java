package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.SupplierOrder;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SupplierOrderRepository extends JpaRepository<SupplierOrder, UUID> {

    @Query("""
        select o from SupplierOrder o
        join fetch o.supplier s
        where o.market.id = :marketId
        order by o.orderDate desc
        """)
    List<SupplierOrder> findByMarketId(@Param("marketId") UUID marketId);

    @Query("""
        select o from SupplierOrder o
        join fetch o.supplier s
        where o.market.id = :marketId and o.status = :status
        order by o.orderDate desc
        """)
    List<SupplierOrder> findByMarketIdAndStatus(
        @Param("marketId") UUID marketId,
        @Param("status") SupplierOrder.Status status
    );

    @Query("""
        select o from SupplierOrder o
        join fetch o.supplier s
        left join fetch o.items i
        left join fetch i.product p
        where o.id = :id and o.market.id = :marketId
        """)
    Optional<SupplierOrder> findByIdWithItems(
        @Param("id") UUID id,
        @Param("marketId") UUID marketId
    );

    @Query("select coalesce(max(cast(substring(o.orderNumber, 4) as int)), 0) from SupplierOrder o where o.market.id = :marketId")
    int findMaxOrderSequence(@Param("marketId") UUID marketId);
}
