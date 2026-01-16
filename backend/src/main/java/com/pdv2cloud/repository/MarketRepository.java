package com.pdv2cloud.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import com.pdv2cloud.model.entity.Market;

public interface MarketRepository extends JpaRepository<Market, UUID> {
    @Query("select m from Market m where m.isActive = true")
    List<Market> findAllActive();
}
