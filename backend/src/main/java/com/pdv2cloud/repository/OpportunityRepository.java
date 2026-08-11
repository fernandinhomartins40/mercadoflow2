package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.Opportunity;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OpportunityRepository extends JpaRepository<Opportunity, UUID> {

    /**
     * Feed: oportunidades que ainda pedem decisão, mais relevantes primeiro.
     *
     * O left join fetch em product evita o N+1 do feed — a alternativa seria
     * uma consulta por linha só para exibir o nome do produto.
     */
    @Query("select o from Opportunity o "
        + "left join fetch o.product "
        + "where o.market.id = :marketId and o.status in ('NOVA', 'VISTA', 'EM_ACAO') "
        + "order by o.priorityScore desc, o.lastDetectedAt desc")
    List<Opportunity> findOpenByMarket(@Param("marketId") UUID marketId);

    @Query("select o from Opportunity o "
        + "left join fetch o.product "
        + "where o.market.id = :marketId "
        + "order by o.lastDetectedAt desc")
    List<Opportunity> findAllByMarket(@Param("marketId") UUID marketId);

    Optional<Opportunity> findByMarketIdAndFingerprint(UUID marketId, String fingerprint);

    Optional<Opportunity> findByIdAndMarketId(UUID id, UUID marketId);

    @Query("select o.status, count(o) from Opportunity o "
        + "where o.market.id = :marketId group by o.status")
    List<Object[]> countByStatus(@Param("marketId") UUID marketId);

    /**
     * Fecha oportunidades que o detector deixou de reencontrar.
     *
     * Se a situação sumiu (o produto voltou a vender, o estoque normalizou), a
     * oportunidade está resolvida — mantê-la aberta faria o feed acumular
     * pendências fantasmas. Só afeta as que o usuário ainda não decidiu.
     */
    @Modifying
    @Query("update Opportunity o set o.status = 'CONCLUIDA', o.statusChangedAt = :now "
        + "where o.market.id = :marketId "
        + "and o.status in ('NOVA', 'VISTA') "
        + "and o.lastDetectedAt < :staleBefore")
    int closeStale(
        @Param("marketId") UUID marketId,
        @Param("staleBefore") LocalDateTime staleBefore,
        @Param("now") LocalDateTime now
    );

    /** Expira o que passou da validade sem decisão (ex.: janela sazonal). */
    @Modifying
    @Query("update Opportunity o set o.status = 'EXPIRADA', o.statusChangedAt = :now "
        + "where o.market.id = :marketId "
        + "and o.status in ('NOVA', 'VISTA') "
        + "and o.expiresAt is not null and o.expiresAt < :now")
    int expireOverdue(@Param("marketId") UUID marketId, @Param("now") LocalDateTime now);
}
