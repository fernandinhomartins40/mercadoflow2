package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.CustomerActivity;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CustomerActivityRepository extends JpaRepository<CustomerActivity, UUID> {

    @Query("select a from CustomerActivity a where a.market.id = :marketId order by a.createdAt desc")
    List<CustomerActivity> timelineOf(@Param("marketId") UUID marketId, Pageable pageable);

    @Query("select a from CustomerActivity a join fetch a.market order by a.createdAt desc")
    Page<CustomerActivity> recentAll(Pageable pageable);

    long countByMarketId(UUID marketId);
}
