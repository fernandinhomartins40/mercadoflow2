package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ProductEnrichment;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductEnrichmentRepository extends JpaRepository<ProductEnrichment, UUID> {
    Optional<ProductEnrichment> findTopByProduct_IdAndProviderOrderByFetchedAtDesc(UUID productId, String provider);

    @Query("""
        select pe
        from ProductEnrichment pe
        join pe.product p
        where (:provider is null or lower(pe.provider) = lower(:provider))
          and (
            :search is null
            or lower(coalesce(pe.canonicalName, '')) like lower(concat('%', :search, '%'))
            or lower(coalesce(pe.brand, '')) like lower(concat('%', :search, '%'))
            or lower(coalesce(p.name, '')) like lower(concat('%', :search, '%'))
            or lower(coalesce(p.ean, '')) like lower(concat('%', :search, '%'))
          )
        order by pe.fetchedAt desc
        """)
    Page<ProductEnrichment> searchCatalogForAdmin(
        @Param("provider") String provider,
        @Param("search") String search,
        Pageable pageable
    );
}
