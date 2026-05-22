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
}
