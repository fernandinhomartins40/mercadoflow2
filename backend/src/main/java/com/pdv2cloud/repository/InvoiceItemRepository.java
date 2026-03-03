package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.InvoiceItem;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface InvoiceItemRepository extends JpaRepository<InvoiceItem, UUID> {
    @Query(
        "select it from InvoiceItem it " +
        "join fetch it.invoice i " +
        "join fetch i.market m " +
        "join fetch it.product p " +
        "where p is not null and not exists (" +
        "    select 1 from ProductObservation po where po.invoiceItem = it" +
        ")"
    )
    List<InvoiceItem> findWithoutProductObservation(Pageable pageable);
}
