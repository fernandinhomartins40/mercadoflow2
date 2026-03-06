package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.CatalogCrawlerRun;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CatalogCrawlerRunRepository extends JpaRepository<CatalogCrawlerRun, UUID> {
    Page<CatalogCrawlerRun> findAllByOrderByRequestedAtDesc(Pageable pageable);
    Optional<CatalogCrawlerRun> findTopByOrderByRequestedAtDesc();
    Optional<CatalogCrawlerRun> findFirstByStatusOrderByRequestedAtAsc(String status);
    Optional<CatalogCrawlerRun> findTopBySourcesJsonContainingOrderByRequestedAtDesc(String sourcesJson);
    long countByStatus(String status);
    long countByStatusAndSourcesJsonContaining(String status, String sourcesJson);
}
