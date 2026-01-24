package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.AgentApiKey;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AgentApiKeyRepository extends JpaRepository<AgentApiKey, UUID> {
    Optional<AgentApiKey> findByKeyHashAndIsActiveTrue(String keyHash);
    List<AgentApiKey> findByMarketIdAndIsActiveTrue(UUID marketId);
}
