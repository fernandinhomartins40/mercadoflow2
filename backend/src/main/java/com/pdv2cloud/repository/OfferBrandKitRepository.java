package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.OfferBrandKit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfferBrandKitRepository extends JpaRepository<OfferBrandKit, UUID> {
    List<OfferBrandKit> findByMarket_IdOrderByIsSystemKitDescUpdatedAtDesc(UUID marketId);
    Optional<OfferBrandKit> findByIdAndMarket_Id(UUID id, UUID marketId);
    Optional<OfferBrandKit> findByMarket_IdAndKitKey(UUID marketId, String kitKey);
}
