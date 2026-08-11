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
 * O que o sistema sugere fazer diante de uma oportunidade, com o cálculo por
 * trás e a decisão do usuário registrada.
 *
 * Segue a estrutura que o plano pede — RECOMENDAÇÃO → EVIDÊNCIAS → CÁLCULOS →
 * CONFIANÇA → IMPACTO → AÇÃO — e cujos protótipos já existiam espalhados no
 * código (`buildReason` do capital, `buildInsight` da promo, `decisionReason`
 * da compra).
 *
 * O campo {@code calculationTrace} é o que separa uma recomendação de um
 * palpite: o lojista pode discordar com fundamento em vez de simplesmente não
 * confiar no número.
 */
@Entity
@Table(name = "recommendations")
@Getter
@Setter
public class Recommendation {

    /** O que fazer. Determina qual fluxo do produto a ação aciona. */
    public enum ActionType {
        /** Repor estoque — alimenta a lista de compras. */
        COMPRAR,
        /** Colocar em promoção — alimenta a criação de campanha. */
        PROMOVER,
        /** Liquidar para liberar capital parado. */
        LIQUIDAR,
        /** Rever preço praticado. */
        AJUSTAR_PRECO,
        /** Mudar posição na loja (vizinhança de cesta). */
        REPOSICIONAR,
        /** Sem ação automática: exige o olho do lojista. */
        INVESTIGAR
    }

    public enum Status {
        /** Sugerida, aguardando decisão. */
        PROPOSTA,
        /** O usuário concordou. */
        ACEITA,
        /** O usuário discordou. */
        REJEITADA,
        /** A ação foi de fato executada no produto. */
        EXECUTADA
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "opportunity_id", nullable = false)
    private Opportunity opportunity;

    @Enumerated(EnumType.STRING)
    @Column(name = "action_type", nullable = false, length = 24)
    private ActionType actionType;

    @Column(nullable = false, length = 300)
    private String title;

    /**
     * Texto na linguagem do supermercadista. Determinístico por construção; na
     * Fase 5 o LLM pode reescrevê-lo, mas este campo continua sendo o fallback
     * sempre disponível.
     */
    @Column(columnDefinition = "text")
    private String rationale;

    /** Parâmetros acionáveis: quantidade, desconto, janela. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> parameters;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> evidence;

    /** Como o número foi obtido, passo a passo. */
    @Column(name = "calculation_trace", columnDefinition = "text")
    private String calculationTrace;

    private BigDecimal confidence;

    @Column(name = "expected_impact_value")
    private BigDecimal expectedImpactValue;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.PROPOSTA;

    @Column(name = "decided_by", length = 200)
    private String decidedBy;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    @Column(name = "decision_note", length = 500)
    private String decisionNote;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
