package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.PriceIntelligenceCheckpoint;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PriceIntelligenceCheckpointRepository extends JpaRepository<PriceIntelligenceCheckpoint, UUID> {
}

