package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.PlanCatalogEntry;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlanCatalogRepository extends JpaRepository<PlanCatalogEntry, String> {

    List<PlanCatalogEntry> findByIsActiveTrueOrderByDisplayOrderAsc();

    List<PlanCatalogEntry> findAllByOrderByDisplayOrderAsc();

    Optional<PlanCatalogEntry> findByStripePriceId(String stripePriceId);
}
