package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.MarketProductAlias;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MarketProductAliasRepository extends JpaRepository<MarketProductAlias, UUID> {
    Optional<MarketProductAlias> findByMarket_IdAndProduct_IdAndNormalizedName(
        UUID marketId,
        UUID productId,
        String normalizedName
    );
}
