package com.pdv2cloud.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.pdv2cloud.model.entity.Alert;
import com.pdv2cloud.model.entity.AlertPriority;
import com.pdv2cloud.model.entity.AlertType;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    @Modifying
    @Query("update Alert a set a.isRead = true where a.market.id = :marketId and a.id = :alertId")
    int markAsRead(@Param("marketId") UUID marketId, @Param("alertId") UUID alertId);

    @Modifying
    @Query("update Alert a set a.isRead = true where a.market.id = :marketId and a.isRead = false")
    int markAllAsRead(@Param("marketId") UUID marketId);
}
