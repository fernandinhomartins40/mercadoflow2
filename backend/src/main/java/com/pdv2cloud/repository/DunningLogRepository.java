package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.DunningLog;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DunningLogRepository extends JpaRepository<DunningLog, UUID> {

    /** Impede a regua de repetir a mesma acao a cada rodada do job. */
    boolean existsByInvoiceIdAndRuleId(UUID invoiceId, UUID ruleId);

    @Query("select l from DunningLog l where l.executedAt >= :since order by l.executedAt desc")
    List<DunningLog> recentSince(@Param("since") LocalDateTime since);

    List<DunningLog> findByMarketIdOrderByExecutedAtDesc(UUID marketId);
}
