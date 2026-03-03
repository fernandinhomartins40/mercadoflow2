package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ProductObservation;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductObservationRepository extends JpaRepository<ProductObservation, UUID> {
    boolean existsByInvoiceItem_Id(UUID invoiceItemId);
}
