package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ProductEnrichment;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductEnrichmentRepository extends JpaRepository<ProductEnrichment, UUID> {
    Optional<ProductEnrichment> findTopByProduct_IdAndProviderOrderByFetchedAtDesc(UUID productId, String provider);
    List<ProductEnrichment> findAllByProduct_IdAndProviderOrderByFetchedAtDesc(UUID productId, String provider);
    List<ProductEnrichment> findAllByProduct_EanInAndProviderOrderByFetchedAtDesc(Collection<String> eans, String provider);
    Optional<ProductEnrichment> findTopByImageStorageKeyOrderByFetchedAtDesc(String imageStorageKey);

    @Query("""
        select pe
        from ProductEnrichment pe
        join pe.product p
        where (:provider = '' or lower(pe.provider) = :provider)
          and pe.fetchedAt = (
            select max(pe2.fetchedAt)
            from ProductEnrichment pe2
            where pe2.product.id = pe.product.id
              and pe2.provider = pe.provider
          )
          and (
            :searchPattern = ''
            or lower(coalesce(pe.canonicalName, '')) like :searchPattern
            or lower(coalesce(pe.brand, '')) like :searchPattern
            or lower(coalesce(p.name, '')) like :searchPattern
            or lower(coalesce(p.ean, '')) like :searchPattern
          )
        order by pe.fetchedAt desc
        """)
    Page<ProductEnrichment> searchCatalogForAdmin(
        @Param("provider") String provider,
        @Param("searchPattern") String searchPattern,
        Pageable pageable
    );

    @Query("""
        select pe
        from ProductEnrichment pe
        where (:provider = '' or pe.provider = :provider)
          and coalesce(pe.imageStorageKey, '') <> ''
          and pe.fetchedAt = (
            select max(pe2.fetchedAt)
            from ProductEnrichment pe2
            where pe2.product.id = pe.product.id
              and pe2.provider = pe.provider
          )
        order by pe.fetchedAt desc
        """)
    Slice<ProductEnrichment> findLatestWithImageStorageKeyForRepair(
        @Param("provider") String provider,
        Pageable pageable
    );
}
