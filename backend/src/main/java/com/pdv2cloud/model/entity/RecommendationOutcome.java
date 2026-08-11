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
 * O que aconteceu depois que o usuário decidiu.
 *
 * Fecha o ciclo DADOS → ... → DECISÃO → AÇÃO → RESULTADO → APRENDIZADO. Antes
 * disto, o sistema recomendava e nunca ficava sabendo se acertou — nenhum score
 * podia se corrigir porque não havia com o que comparar.
 *
 * O {@code baselineSnapshot} é gravado NO ATO da decisão, não depois. Medir
 * contra números recalculados mais tarde seria comparar com um passado que já
 * embute o efeito da própria decisão.
 */
@Entity
@Table(name = "recommendation_outcomes")
@Getter
@Setter
public class RecommendationOutcome {

    /**
     * Veredito da medição.
     *
     * SEM_DADOS não é falha: um produto que parou de vender de vez não permite
     * dizer se a recomendação era boa, e fingir um veredito seria pior que
     * admitir a ausência.
     */
    public enum Verdict {
        /** O resultado veio igual ou melhor que o previsto. */
        ACERTOU,
        /** Houve movimento na direção certa, aquém do previsto. */
        PARCIAL,
        /** O resultado contrariou a previsão. */
        ERROU,
        /** Sem volume suficiente para julgar. */
        SEM_DADOS
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recommendation_id", nullable = false)
    private Recommendation recommendation;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id")
    private Product product;

    @Column(name = "action_type", length = 24)
    private String actionType;

    @Column(name = "horizon_days", nullable = false)
    private Integer horizonDays = 30;

    /** Antes desta data não há janela suficiente para medir. */
    @Column(name = "measure_after")
    private LocalDateTime measureAfter;

    @Column(name = "measured_at")
    private LocalDateTime measuredAt;

    /** Como estava a situação quando o usuário decidiu. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "baseline_snapshot", columnDefinition = "jsonb")
    private Map<String, Object> baselineSnapshot;

    /** Como ficou depois do horizonte. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "actual_snapshot", columnDefinition = "jsonb")
    private Map<String, Object> actualSnapshot;

    @Column(name = "predicted_value")
    private BigDecimal predictedValue;

    @Column(name = "actual_value")
    private BigDecimal actualValue;

    @Column(name = "delta_value")
    private BigDecimal deltaValue;

    @Column(name = "delta_percent")
    private BigDecimal deltaPercent;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private Verdict verdict;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
