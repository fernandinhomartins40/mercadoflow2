package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.Recommendation;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RecommendationRepository extends JpaRepository<Recommendation, UUID> {

    @Query("select r from Recommendation r "
        + "join fetch r.opportunity o left join fetch o.product "
        + "where r.market.id = :marketId and r.status = 'PROPOSTA' "
        + "order by r.expectedImpactValue desc nulls last, r.createdAt desc")
    List<Recommendation> findPendingByMarket(@Param("marketId") UUID marketId);

    @Query("select r from Recommendation r "
        + "join fetch r.opportunity o left join fetch o.product "
        + "where r.market.id = :marketId and r.status in ('ACEITA', 'REJEITADA', 'EXECUTADA') "
        + "order by r.decidedAt desc nulls last")
    List<Recommendation> findDecidedByMarket(@Param("marketId") UUID marketId);

    List<Recommendation> findByOpportunityId(UUID opportunityId);

    Optional<Recommendation> findByIdAndMarketId(UUID id, UUID marketId);

    /** Existe recomendação viva para esta oportunidade? Evita duplicar sugestão. */
    @Query("select count(r) > 0 from Recommendation r "
        + "where r.opportunity.id = :opportunityId and r.status in ('PROPOSTA', 'ACEITA')")
    boolean hasActiveForOpportunity(@Param("opportunityId") UUID opportunityId);

    @Query("select r.status, count(r) from Recommendation r "
        + "where r.market.id = :marketId group by r.status")
    List<Object[]> countByStatus(@Param("marketId") UUID marketId);
}
