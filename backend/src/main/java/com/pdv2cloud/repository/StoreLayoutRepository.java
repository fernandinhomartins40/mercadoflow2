package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.StoreLayout;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreLayoutRepository extends JpaRepository<StoreLayout, UUID> {
    Optional<StoreLayout> findByMarketId(UUID marketId);
}
