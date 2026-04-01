package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.StatePriceObservation;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Collection;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface StatePriceObservationRepository extends JpaRepository<StatePriceObservation, UUID> {
    boolean existsBySource_IdAndProviderProductIdAndObservedStoreIdAndObservedAt(
        UUID sourceId,
        String providerProductId,
        String observedStoreId,
        java.time.LocalDateTime observedAt
    );

    List<StatePriceObservation> findByProduct_IdOrderByPriceAscObservedAtDesc(UUID productId);

    long countBySource_Id(UUID sourceId);

    List<StatePriceObservation> findBySource_IdOrderByObservedAtDesc(UUID sourceId);

    List<StatePriceObservation> findByProduct_IdInOrderByPriceAscObservedAtDesc(Collection<UUID> productIds);

    @Query(
        value = """
            select o.product_id
            from state_price_observations o
            join state_price_sources s on s.id = o.source_id
            join products p on p.id = o.product_id
            where (:provider = '' or lower(s.provider) = :provider)
              and (:state = '' or upper(o.observed_state) = :state)
              and (
                :searchPattern = ''
                or lower(coalesce(o.normalized_name, '')) like :searchPattern
                or lower(coalesce(o.product_name, '')) like :searchPattern
                or lower(coalesce(o.brand, '')) like :searchPattern
                or lower(coalesce(p.name, '')) like :searchPattern
                or lower(coalesce(p.ean, '')) like :searchPattern
              )
            group by o.product_id
            order by min(o.price) asc, max(o.observed_at) desc, o.product_id asc
            """,
        countQuery = """
            select count(distinct o.product_id)
            from state_price_observations o
            join state_price_sources s on s.id = o.source_id
            join products p on p.id = o.product_id
            where (:provider = '' or lower(s.provider) = :provider)
              and (:state = '' or upper(o.observed_state) = :state)
              and (
                :searchPattern = ''
                or lower(coalesce(o.normalized_name, '')) like :searchPattern
                or lower(coalesce(o.product_name, '')) like :searchPattern
                or lower(coalesce(o.brand, '')) like :searchPattern
                or lower(coalesce(p.name, '')) like :searchPattern
                or lower(coalesce(p.ean, '')) like :searchPattern
              )
            """,
        nativeQuery = true
    )
    Page<UUID> findComparableProductIds(
        @Param("provider") String provider,
        @Param("state") String state,
        @Param("searchPattern") String searchPattern,
        Pageable pageable
    );

    @Query("select distinct upper(o.observedState) from StatePriceObservation o where o.observedState is not null order by upper(o.observedState)")
    List<String> findDistinctObservedStates();

    @Query("select count(distinct o.product.id) from StatePriceObservation o")
    long countDistinctProductIds();

    @Query("select count(distinct upper(o.observedState)) from StatePriceObservation o where o.observedState is not null")
    long countDistinctStates();

    @Query("select max(o.observedAt) from StatePriceObservation o")
    LocalDateTime findLatestObservedAt();
}
