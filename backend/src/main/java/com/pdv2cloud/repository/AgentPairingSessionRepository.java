package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.AgentPairingSession;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AgentPairingSessionRepository extends JpaRepository<AgentPairingSession, UUID> {

    Optional<AgentPairingSession> findByUserCode(String userCode);

    boolean existsByUserCode(String userCode);

    @Modifying
    @Query("update AgentPairingSession s set s.status = 'EXPIRED' "
        + "where s.status in ('PENDING', 'APPROVED') and s.expiresAt < :now")
    int expireStaleSessions(@Param("now") LocalDateTime now);
}
