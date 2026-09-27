package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.SupplierOrderItem;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SupplierOrderItemRepository extends JpaRepository<SupplierOrderItem, UUID> {

    @Query("""
        select i from SupplierOrderItem i
        join fetch i.product p
        where i.supplierOrder.id = :orderId
        order by p.name
        """)
    List<SupplierOrderItem> findByOrderIdWithProduct(@Param("orderId") UUID orderId);

    Optional<SupplierOrderItem> findByIdAndSupplierOrderId(UUID id, UUID orderId);

    /**
     * Itens mais recentes do produto em pedidos não cancelados da loja: dizem de
     * quem a loja costuma comprar o produto e por quanto.
     */
    @Query("""
        select i from SupplierOrderItem i
        join fetch i.supplierOrder o
        join fetch o.supplier s
        where o.market.id = :marketId and i.product.id = :productId
          and o.status <> com.pdv2cloud.model.entity.SupplierOrder.Status.CANCELADO
        order by o.orderDate desc
        """)
    List<SupplierOrderItem> findRecentByProduct(
        @Param("marketId") UUID marketId,
        @Param("productId") UUID productId,
        org.springframework.data.domain.Pageable pageable);
}
