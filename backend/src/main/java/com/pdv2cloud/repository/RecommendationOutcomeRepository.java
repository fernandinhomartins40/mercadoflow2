package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.RecommendationOutcome;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RecommendationOutcomeRepository extends JpaRepository<RecommendationOutcome, UUID> {

    /** Resultados que já passaram do horizonte e ainda não foram medidos. */
    @Query("select o from RecommendationOutcome o "
        + "join fetch o.recommendation r join fetch r.opportunity "
        + "where o.market.id = :marketId "
        + "and o.measuredAt is null "
        + "and o.measureAfter is not null and o.measureAfter <= :now")
    List<RecommendationOutcome> findDueForMeasurement(
        @Param("marketId") UUID marketId,
        @Param("now") LocalDateTime now
    );

    @Query("select o from RecommendationOutcome o "
        + "join fetch o.recommendation r join fetch r.opportunity "
        + "left join fetch o.product "
        + "where o.market.id = :marketId and o.measuredAt is not null "
        + "order by o.measuredAt desc")
    List<RecommendationOutcome> findMeasuredByMarket(@Param("marketId") UUID marketId);

    Optional<RecommendationOutcome> findByRecommendationId(UUID recommendationId);

    /**
     * Taxa de acerto por tipo de ação — a base da calibração.
     *
     * Se COMPRAR acerta 80% e PROMOVER 30%, o priority score de promoção está
     * otimista e precisa de ajuste.
     */
    @Query("select o.actionType, o.verdict, count(o) from RecommendationOutcome o "
        + "where o.market.id = :marketId and o.measuredAt is not null "
        + "group by o.actionType, o.verdict")
    List<Object[]> summarizeByActionAndVerdict(@Param("marketId") UUID marketId);
}
