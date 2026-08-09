package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.PlanPriceHistory;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlanPriceHistoryRepository extends JpaRepository<PlanPriceHistory, UUID> {

    List<PlanPriceHistory> findTop50ByOrderByCreatedAtDesc();

    List<PlanPriceHistory> findByPlanCodeOrderByCreatedAtDesc(String planCode);
}
