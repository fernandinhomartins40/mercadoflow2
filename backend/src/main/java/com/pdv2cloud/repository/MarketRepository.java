package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import java.util.List;
import java.util.UUID;
import java.time.LocalDateTime;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.pdv2cloud.model.entity.Market;

public interface MarketRepository extends JpaRepository<Market, UUID> {
    @Query("select m from Market m where m.isActive = true")
    List<Market> findAllActive();

    @Query("""
        select m
        from Market m
        where (:search = ''
            or lower(m.name) like :search
            or lower(coalesce(m.cnpj, '')) like :search)
          and (:planType is null or m.planType = :planType)
          and (:billingStatus is null or m.billingStatus = :billingStatus)
          and (:active is null or m.isActive = :active)
        order by m.createdAt desc
        """)
    Page<Market> searchForSuperAdmin(
        @Param("search") String search,
        @Param("planType") PlanType planType,
        @Param("billingStatus") MarketBillingStatus billingStatus,
        @Param("active") Boolean active,
        Pageable pageable
    );

    long countByIsActive(Boolean isActive);
    long countByBillingStatus(MarketBillingStatus billingStatus);
    long countByPlanType(PlanType planType);

    // ── Rede (matriz + filiais) ─────────────────────────────────────────────

    List<Market> findByParentMarketId(UUID parentMarketId);

    /**
     * Todos os mercados da rede: a matriz e suas filiais.
     *
     * Base de qualquer limite agregado — o teto do plano vale para a empresa
     * inteira, não para cada loja isolada.
     */
    @Query("select m from Market m where m.id = :rootId or m.parentMarket.id = :rootId")
    List<Market> findNetwork(@Param("rootId") UUID rootId);

    @Query("select count(m) from Market m where m.id = :rootId or m.parentMarket.id = :rootId")
    long countNetworkMembers(@Param("rootId") UUID rootId);

    /**
     * Contas com o mesmo CNPJ raiz. Filiais da mesma empresa compartilham os 8
     * primeiros dígitos, então isto revela a rede que tentou se cadastrar
     * fatiada em várias contas.
     */
    List<Market> findByCnpjRoot(String cnpjRoot);

    @Query("select count(m) from Market m where m.cnpjRoot = :cnpjRoot")
    long countByCnpjRootValue(@Param("cnpjRoot") String cnpjRoot);
    long countByAccessExpiresAtBetween(LocalDateTime start, LocalDateTime end);
}
