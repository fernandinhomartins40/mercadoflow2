package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.NetworkInvoice;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NetworkInvoiceRepository extends JpaRepository<NetworkInvoice, UUID> {

    Optional<NetworkInvoice> findByStripeInvoiceId(String stripeInvoiceId);

    @Query("select i from NetworkInvoice i join fetch i.market "
        + "where i.market.id = :marketId order by i.createdAt desc")
    List<NetworkInvoice> findByMarket(@Param("marketId") UUID marketId);

    /** Faturas vencidas e não pagas — a fila de cobrança do painel. */
    @Query("select i from NetworkInvoice i join fetch i.market "
        + "where i.status = 'open' and i.dueDate < :now order by i.dueDate asc")
    List<NetworkInvoice> findOverdue(@Param("now") LocalDateTime now);

    /** Em aberto, vencidas ou não: total a receber. */
    @Query("select i from NetworkInvoice i join fetch i.market "
        + "where i.status = 'open' order by i.dueDate asc")
    List<NetworkInvoice> findOpen();

    @Query("select coalesce(sum(i.amountPaidCents), 0) from NetworkInvoice i "
        + "where i.status = 'paid' and i.paidAt >= :since")
    long sumPaidSince(@Param("since") LocalDateTime since);

    @Query("select coalesce(sum(i.amountDueCents), 0) from NetworkInvoice i "
        + "where i.status = 'open'")
    long sumOpen();

    @Query("select i from NetworkInvoice i join fetch i.market order by i.createdAt desc")
    List<NetworkInvoice> findAllWithMarket();
}
