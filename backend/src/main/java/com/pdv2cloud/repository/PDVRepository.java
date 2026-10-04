package com.pdv2cloud.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.pdv2cloud.model.entity.PDV;

public interface PDVRepository extends JpaRepository<PDV, UUID> {
    /** Caixas em uso (os arquivados ficam fora da lista e do limite do plano). */
    @Query("select p from PDV p where p.market.id = :marketId and p.archivedAt is null order by p.createdAt")
    List<PDV> findByMarketId(@Param("marketId") UUID marketId);
}
