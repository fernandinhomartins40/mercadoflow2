package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.DunningRule;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DunningRuleRepository extends JpaRepository<DunningRule, UUID> {

    List<DunningRule> findByIsActiveTrueOrderByDaysOffsetAsc();

    List<DunningRule> findAllByOrderByDaysOffsetAsc();
}
