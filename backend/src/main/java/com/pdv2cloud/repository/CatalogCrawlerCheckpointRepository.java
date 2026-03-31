package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.CatalogCrawlerCheckpoint;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CatalogCrawlerCheckpointRepository extends JpaRepository<CatalogCrawlerCheckpoint, UUID> {
    Optional<CatalogCrawlerCheckpoint> findByProviderAndScopeTypeAndScopeKey(String provider, String scopeType, String scopeKey);
    List<CatalogCrawlerCheckpoint> findTop5000ByProviderAndStatusOrderByUpdatedAtDesc(String provider, String status);
    List<CatalogCrawlerCheckpoint> findTop5000ByProviderAndScopeTypeAndStatusOrderByUpdatedAtDesc(String provider, String scopeType, String status);
    List<CatalogCrawlerCheckpoint> findTop50ByProviderAndRunIdOrderByUpdatedAtDesc(String provider, UUID runId);
    List<CatalogCrawlerCheckpoint> findTop25ByProviderAndRunIdAndStatusOrderByUpdatedAtDesc(String provider, UUID runId, String status);
    long countByProviderAndRunIdAndStatus(String provider, UUID runId, String status);
}
