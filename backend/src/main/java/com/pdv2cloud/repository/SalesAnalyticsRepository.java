package com.pdv2cloud.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.pdv2cloud.model.entity.SalesAnalytics;
import com.pdv2cloud.model.dto.ProductAnalyticsDTO;
import com.pdv2cloud.model.dto.SalesTrendPointDTO;

public interface SalesAnalyticsRepository extends JpaRepository<SalesAnalytics, UUID> {
    @Query("select new com.pdv2cloud.model.dto.ProductAnalyticsDTO(p.id, p.name, p.category, sum(sa.revenue), sum(sa.quantitySold), avg(sa.averagePrice), sum(sa.transactionCount)) " +
           "from SalesAnalytics sa join sa.product p " +
           "where sa.market.id = :marketId and (:category is null or p.category = :category) " +
           "group by p.id, p.name, p.category")
    Page<ProductAnalyticsDTO> getProductAnalytics(@Param("marketId") UUID marketId,
                                                  @Param("category") String category,
                                                  Pageable pageable);

    @Query("select new com.pdv2cloud.model.dto.SalesTrendPointDTO(sa.date, sum(sa.revenue)) " +
           "from SalesAnalytics sa where sa.market.id = :marketId and sa.date between :start and :end " +
           "group by sa.date order by sa.date")
    List<SalesTrendPointDTO> getSalesTrend(@Param("marketId") UUID marketId,
                                           @Param("start") LocalDate start,
                                           @Param("end") LocalDate end);

    @Query("select sa.product.id, sum(sa.revenue), sum(sa.quantitySold), sum(sa.transactionCount) " +
           "from SalesAnalytics sa where sa.market.id = :marketId and sa.date between :start and :end " +
           "group by sa.product.id order by sum(sa.revenue) desc")
    List<Object[]> aggregateByProduct(@Param("marketId") UUID marketId,
                                      @Param("start") LocalDate start,
                                      @Param("end") LocalDate end);
}
