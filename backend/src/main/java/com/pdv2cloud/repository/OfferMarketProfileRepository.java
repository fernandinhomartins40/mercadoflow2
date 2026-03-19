package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.OfferMarketProfile;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfferMarketProfileRepository extends JpaRepository<OfferMarketProfile, UUID> {
    Optional<OfferMarketProfile> findByMarket_Id(UUID marketId);
}
