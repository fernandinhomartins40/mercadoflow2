package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.CatalogCrawlerConfig;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CatalogCrawlerConfigRepository extends JpaRepository<CatalogCrawlerConfig, UUID> {
}
