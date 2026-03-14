package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.OfferGenerationJobItem;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfferGenerationJobItemRepository extends JpaRepository<OfferGenerationJobItem, UUID> {
    List<OfferGenerationJobItem> findByJob_IdOrderByPositionIndexAsc(UUID jobId);
}

