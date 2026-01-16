package com.pdv2cloud.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.pdv2cloud.model.entity.Invoice;

public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {
    boolean existsByChaveNFe(String chaveNFe);

    @Query("select coalesce(sum(i.valorTotal), 0) from Invoice i where i.market.id = :marketId and date(i.dataEmissao) between :start and :end")
    BigDecimal getTotalRevenue(@Param("marketId") UUID marketId, @Param("start") LocalDate start, @Param("end") LocalDate end);

    @Query("select new com.pdv2cloud.model.dto.TopSellerDTO(p.id, p.name, sum(it.valorTotal), sum(it.quantidade)) " +
           "from InvoiceItem it join it.invoice i join it.product p " +
           "where i.market.id = :marketId and date(i.dataEmissao) between :start and :end " +
           "group by p.id, p.name order by sum(it.valorTotal) desc")
    List<com.pdv2cloud.model.dto.TopSellerDTO> findTopSellers(@Param("marketId") UUID marketId,
                                                              @Param("start") LocalDate start,
                                                              @Param("end") LocalDate end);

    @Query("select p.id, sum(it.quantidade), sum(it.valorTotal), avg(it.valorUnitario), count(distinct i.id) " +
           "from InvoiceItem it join it.invoice i join it.product p " +
           "where i.market.id = :marketId and date(i.dataEmissao) = :date " +
           "group by p.id")
    List<Object[]> aggregateDailySales(@Param("marketId") UUID marketId, @Param("date") LocalDate date);

    @Query("select i from Invoice i join fetch i.items it join fetch it.product where i.market.id = :marketId and i.dataEmissao >= :since")
    List<Invoice> findRecentInvoices(@Param("marketId") UUID marketId, @Param("since") LocalDateTime since);

    @Query("select count(distinct it.product.id) from InvoiceItem it join it.invoice i where i.market.id = :marketId")
    long countDistinctProducts(@Param("marketId") UUID marketId);
}
