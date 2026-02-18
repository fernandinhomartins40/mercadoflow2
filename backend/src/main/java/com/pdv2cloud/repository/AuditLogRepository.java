package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    Page<AuditLog> findByMarketIdOrderByCreatedAtDesc(UUID marketId, Pageable pageable);

    Page<AuditLog> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    Page<AuditLog> findByAgentKeyIdOrderByCreatedAtDesc(UUID agentKeyId, Pageable pageable);

    Page<AuditLog> findByEntityTypeAndEntityIdOrderByCreatedAtDesc(
        String entityType, UUID entityId, Pageable pageable);

    List<AuditLog> findByCreatedAtBetween(LocalDateTime start, LocalDateTime end);

    long countByMarketIdAndActionAndCreatedAtAfter(UUID marketId, String action, LocalDateTime since);
}
