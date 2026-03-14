package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.OfferTemplate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfferTemplateRepository extends JpaRepository<OfferTemplate, UUID> {
    List<OfferTemplate> findByMarket_IdOrderByIsSystemTemplateDescUpdatedAtDesc(UUID marketId);
    Optional<OfferTemplate> findByIdAndMarket_Id(UUID id, UUID marketId);
    Optional<OfferTemplate> findByMarket_IdAndTemplateKey(UUID marketId, String templateKey);
    long countByMarket_Id(UUID marketId);
}

