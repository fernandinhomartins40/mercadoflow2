package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.NetworkContract;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NetworkContractRepository extends JpaRepository<NetworkContract, UUID> {

    @Query("select c from NetworkContract c join fetch c.market "
        + "where c.market.id = :marketId and c.status = 'ACTIVE'")
    Optional<NetworkContract> findActiveByMarket(@Param("marketId") UUID marketId);

    @Query("select c from NetworkContract c join fetch c.market order by c.createdAt desc")
    List<NetworkContract> findAllWithMarket();

    List<NetworkContract> findByMarketIdOrderByCreatedAtDesc(UUID marketId);

    Optional<NetworkContract> findByStripeSubscriptionId(String stripeSubscriptionId);
}
