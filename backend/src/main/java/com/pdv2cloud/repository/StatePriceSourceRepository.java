package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.StatePriceSource;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StatePriceSourceRepository extends JpaRepository<StatePriceSource, UUID> {
    Optional<StatePriceSource> findByProviderIgnoreCase(String provider);

    List<StatePriceSource> findByActiveTrueOrderByNameAsc();

    long countByActiveTrue();
}
