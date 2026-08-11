package com.pdv2cloud.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Uma oportunidade de negócio detectada na loja, com ciclo de vida.
 *
 * É o modelo comum que a auditoria (§22.3) apontou como ausente: alertas,
 * candidatos a promoção e vereditos de capital eram três formatos distintos
 * para o mesmo conceito, nenhum deles com memória do que o usuário fez.
 *
 * equals/hashCode ficam com a identidade padrão de objeto (não sobrescritos de
 * propósito): hashCode derivado de associação já derrubou a ingestão de notas
 * neste projeto.
 */
@Entity
@Table(name = "opportunities")
@Getter
@Setter
public class Opportunity {

    /**
     * Ciclo de vida. A transição é sempre explícita — nada volta para NOVA
     * depois de visto, porque "o usuário já sabe disso" é informação que não
     * se perde.
     */
    public enum Status {
        /** Detectada e ainda não aberta pelo usuário. */
        NOVA,
        /** O usuário abriu o feed e viu. */
        VISTA,
        /** Existe recomendação aceita, aguardando resultado. */
        EM_ACAO,
        /** Resolvida — a situação que a gerou não existe mais. */
        CONCLUIDA,
        /** O usuário decidiu que não é relevante. */
        DESCARTADA,
        /** Perdeu validade sem decisão (janela sazonal passou, por exemplo). */
        EXPIRADA
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    /**
     * Chave estável que identifica a MESMA oportunidade entre execuções do
     * detector. Sem ela, cada rodada criaria uma linha nova e o feed viraria
     * histórico em vez de lista de pendências.
     */
    @Column(nullable = false, length = 200)
    private String fingerprint;

    @Column(nullable = false, length = 48)
    private String type;

    @Column(nullable = false, length = 24)
    private String source;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id")
    private Product product;

    @Column(length = 200)
    private String category;

    @Column(nullable = false, length = 300)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    /** Os números que sustentam a oportunidade. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> evidence;

    @Column(name = "expected_impact_value")
    private BigDecimal expectedImpactValue;

    private BigDecimal confidence;

    @Column(name = "priority_score", nullable = false)
    private BigDecimal priorityScore = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.NOVA;

    @Column(name = "first_detected_at", nullable = false)
    private LocalDateTime firstDetectedAt = LocalDateTime.now();

    @Column(name = "last_detected_at", nullable = false)
    private LocalDateTime lastDetectedAt = LocalDateTime.now();

    /** Quantas rodadas do detector reencontraram a mesma situação. */
    @Column(name = "detection_count", nullable = false)
    private Integer detectionCount = 1;

    @Column(name = "status_changed_at")
    private LocalDateTime statusChangedAt;

    @Column(name = "status_changed_by", length = 200)
    private String statusChangedBy;

    @Column(name = "dismiss_reason", length = 500)
    private String dismissReason;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    /** Oportunidade que ainda pede decisão do usuário. */
    public boolean isOpen() {
        return status == Status.NOVA || status == Status.VISTA || status == Status.EM_ACAO;
    }
}
