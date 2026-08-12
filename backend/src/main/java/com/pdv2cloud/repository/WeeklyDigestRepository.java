package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.WeeklyDigest;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WeeklyDigestRepository extends JpaRepository<WeeklyDigest, UUID> {

    /** Idempotência do job: rodar duas vezes atualiza em vez de duplicar. */
    Optional<WeeklyDigest> findByMarketIdAndWeekStart(UUID marketId, LocalDate weekStart);

    /**
     * As semanas mais recentes, para a tela mostrar a evolução.
     *
     * A ordem decrescente importa: o resumo mais novo é o que o lojista quer
     * ver primeiro ao abrir a tela.
     */
    @Query("select d from WeeklyDigest d where d.market.id = :marketId "
        + "order by d.weekStart desc")
    List<WeeklyDigest> findRecentByMarket(@Param("marketId") UUID marketId);
}
