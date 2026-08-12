package com.pdv2cloud.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * O resumo de uma semana da loja: os números apurados e a leitura deles.
 *
 * Guarda métricas E texto. O texto é a interpretação; o jsonb é o fato — e é
 * ele que mantém as semanas comparáveis entre si mesmo que o modelo, o prompt
 * ou o provedor mudem no meio do caminho.
 */
@Entity
@Table(name = "weekly_digests")
@Getter
@Setter
public class WeeklyDigest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    /** Segunda-feira da semana resumida. */
    @Column(name = "week_start", nullable = false)
    private LocalDate weekStart;

    @Column(name = "week_end", nullable = false)
    private LocalDate weekEnd;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> metrics;

    @Column(nullable = false, columnDefinition = "text")
    private String summary;

    /** TRUE quando o texto veio do sistema, não de um LLM. */
    @Column(nullable = false)
    private Boolean deterministic = false;

    @Column(length = 24)
    private String provider;

    @Column(length = 120)
    private String model;

    @Column(name = "prompt_version", length = 16)
    private String promptVersion;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
