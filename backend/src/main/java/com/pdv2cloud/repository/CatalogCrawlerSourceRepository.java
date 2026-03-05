package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.CatalogCrawlerSource;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CatalogCrawlerSourceRepository extends JpaRepository<CatalogCrawlerSource, UUID> {
    List<CatalogCrawlerSource> findAllByOrderByNameAsc();
    Optional<CatalogCrawlerSource> findByProvider(String provider);
}
