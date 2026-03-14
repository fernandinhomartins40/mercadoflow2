package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.OfferGenerationJob;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfferGenerationJobRepository extends JpaRepository<OfferGenerationJob, UUID> {
    List<OfferGenerationJob> findTop20ByMarket_IdOrderByCreatedAtDesc(UUID marketId);
    Optional<OfferGenerationJob> findByIdAndMarket_Id(UUID id, UUID marketId);
    long countByMarket_Id(UUID marketId);
    long countByMarket_IdAndStatus(UUID marketId, String status);
}

