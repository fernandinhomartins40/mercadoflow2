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
    Optional<ProductEnrichment> findTopByProduct_IdOrderByFetchedAtDesc(UUID productId);
    List<ProductEnrichment> findAllByProduct_IdOrderByFetchedAtDesc(UUID productId);
    List<ProductEnrichment> findAllByProduct_EanInOrderByFetchedAtDesc(Collection<String> eans);
    Optional<ProductEnrichment> findTopByImageStorageKeyOrderByFetchedAtDesc(String imageStorageKey);

    @Query(
        value = """
            select latest.*
            from (
                select distinct on (pe.product_id) pe.*
                from product_enrichments pe
                join products p on p.id = pe.product_id
                where (:provider = '' or lower(pe.provider) = :provider)
                  and (
                    :brandPattern = ''
                    or lower(coalesce(pe.brand, '')) like :brandPattern
                    or lower(coalesce(p.brand, '')) like :brandPattern
                  )
                  and (
                    :categoryPattern = ''
                    or lower(coalesce(pe.category, '')) like :categoryPattern
                    or lower(coalesce(p.category, '')) like :categoryPattern
                  )
                  and (
                    :imageStatus = ''
                    or (
                      :imageStatus = 'WITH_IMAGE'
                      and (
                        coalesce(pe.image_storage_key, '') <> ''
                        or coalesce(pe.image_url, '') <> ''
                      )
                    )
                    or (
                      :imageStatus = 'WITHOUT_IMAGE'
                      and coalesce(pe.image_storage_key, '') = ''
                      and coalesce(pe.image_url, '') = ''
                    )
                  )
                  and (
                    :searchPattern = ''
                    or lower(coalesce(pe.canonical_name, '')) like :searchPattern
                    or lower(coalesce(pe.brand, '')) like :searchPattern
                    or lower(coalesce(p.name, '')) like :searchPattern
                    or lower(coalesce(p.ean, '')) like :searchPattern
                  )
                order by pe.product_id, pe.fetched_at desc, pe.id desc
            ) latest
            order by latest.fetched_at desc, latest.id desc
            """,
        countQuery = """
            select count(distinct pe.product_id)
            from product_enrichments pe
            join products p on p.id = pe.product_id
            where (:provider = '' or lower(pe.provider) = :provider)
              and (
                :brandPattern = ''
                or lower(coalesce(pe.brand, '')) like :brandPattern
                or lower(coalesce(p.brand, '')) like :brandPattern
              )
              and (
                :categoryPattern = ''
                or lower(coalesce(pe.category, '')) like :categoryPattern
                or lower(coalesce(p.category, '')) like :categoryPattern
              )
              and (
                :imageStatus = ''
                or (
                  :imageStatus = 'WITH_IMAGE'
                  and (
                    coalesce(pe.image_storage_key, '') <> ''
                    or coalesce(pe.image_url, '') <> ''
                  )
                )
                or (
                  :imageStatus = 'WITHOUT_IMAGE'
                  and coalesce(pe.image_storage_key, '') = ''
                  and coalesce(pe.image_url, '') = ''
                )
              )
              and (
                :searchPattern = ''
                or lower(coalesce(pe.canonical_name, '')) like :searchPattern
                or lower(coalesce(pe.brand, '')) like :searchPattern
                or lower(coalesce(p.name, '')) like :searchPattern
                or lower(coalesce(p.ean, '')) like :searchPattern
              )
            """,
        nativeQuery = true
    )
    Page<ProductEnrichment> searchLatestCatalogForAdmin(
        @Param("provider") String provider,
        @Param("brandPattern") String brandPattern,
        @Param("categoryPattern") String categoryPattern,
        @Param("imageStatus") String imageStatus,
        @Param("searchPattern") String searchPattern,
        Pageable pageable
    );

    @Query("""
        select pe
        from ProductEnrichment pe
        where (:provider = '' or pe.provider = :provider)
          and coalesce(pe.imageStorageKey, '') <> ''
        order by pe.fetchedAt desc
        """)
    Slice<ProductEnrichment> findLatestWithImageStorageKeyForRepair(
        @Param("provider") String provider,
        Pageable pageable
    );
}
