package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.OfferCampaignKit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfferCampaignKitRepository extends JpaRepository<OfferCampaignKit, UUID> {
    List<OfferCampaignKit> findByMarket_IdOrderByIsSystemKitDescUpdatedAtDesc(UUID marketId);
    Optional<OfferCampaignKit> findByIdAndMarket_Id(UUID id, UUID marketId);
    Optional<OfferCampaignKit> findByMarket_IdAndKitKey(UUID marketId, String kitKey);
}
