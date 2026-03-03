package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.ProductEnrichment;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductEnrichmentRepository extends JpaRepository<ProductEnrichment, UUID> {
}
