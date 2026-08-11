package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.AiUsageLog;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AiUsageLogRepository extends JpaRepository<AiUsageLog, UUID> {

    /**
     * Consumo do período, para a tela de configuração responder "minha chave
     * está sendo usada, e quanto?".
     *
     * Devolve linhas (outcome, chamadas, tokens de entrada, tokens de saída).
     */
    @Query("select l.outcome, count(l), coalesce(sum(l.inputTokens), 0), "
        + "coalesce(sum(l.outputTokens), 0) "
        + "from AiUsageLog l where l.market.id = :marketId and l.createdAt >= :since "
        + "group by l.outcome")
    List<Object[]> summarizeSince(
        @Param("marketId") UUID marketId, @Param("since") LocalDateTime since);

    @Query("select l from AiUsageLog l where l.market.id = :marketId "
        + "order by l.createdAt desc")
    List<AiUsageLog> findRecent(@Param("marketId") UUID marketId);
}
