package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.Campaign;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CampaignRepository extends JpaRepository<Campaign, UUID> {
    List<Campaign> findByMarketId(UUID marketId);
}

