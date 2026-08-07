package com.pdv2cloud.model.entity;

import java.time.LocalDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Sessao de pareamento do Agente Mercado Flow (ver V30__agent_pairing_sessions.sql).
 *
 * A API key em texto puro vive em {@link #issuedApiKey} apenas entre a aprovacao
 * pelo usuario e o resgate pelo agente; depois disso o campo e zerado.
 */
@Entity
@Table(name = "agent_pairing_sessions")
@Data
@NoArgsConstructor
public class AgentPairingSession {

    public enum Status {
        PENDING,
        APPROVED,
        CONSUMED,
        EXPIRED,
        CANCELLED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_code", nullable = false, unique = true, length = 16)
    private String userCode;

    @Column(name = "agent_secret_hash", nullable = false, length = 64)
    private String agentSecretHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.PENDING;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id")
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pdv_id")
    private PDV pdv;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "agent_api_key_id")
    private AgentApiKey agentApiKey;

    @Column(name = "issued_api_key", length = 128)
    private String issuedApiKey;

    @Column(name = "pdv_name")
    private String pdvName;

    @Column(name = "hostname")
    private String hostname;

    @Column(name = "approved_by_user_id")
    private UUID approvedByUserId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "consumed_at")
    private LocalDateTime consumedAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public boolean isExpired() {
        return expiresAt != null && expiresAt.isBefore(LocalDateTime.now());
    }
}
