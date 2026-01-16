package com.pdv2cloud.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.pdv2cloud.model.entity.Alert;
import com.pdv2cloud.model.entity.AlertPriority;
import com.pdv2cloud.model.entity.AlertType;
import java.time.LocalDateTime;

public interface AlertRepository extends JpaRepository<Alert, UUID> {
    long countByMarketIdAndIsReadFalse(UUID marketId);
    List<Alert> findByMarketId(UUID marketId);
    List<Alert> findByMarketIdAndType(UUID marketId, AlertType type);
    List<Alert> findByMarketIdAndPriority(UUID marketId, AlertPriority priority);
    List<Alert> findByMarketIdAndIsReadFalse(UUID marketId);
    boolean existsByMarketIdAndProductIdAndTypeAndCreatedAtAfter(UUID marketId,
                                                                 UUID productId,
                                                                 AlertType type,
                                                                 LocalDateTime after);
}
