package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.ToString;

/**
 * Consumo de um mercado num ciclo mensal (ver V33__saas_plans_and_usage.sql).
 *
 * O contador é incrementado na ingestão em vez de recalculado por COUNT sobre
 * invoices: a decisão de aceitar ou recusar a nota precisa ser O(1), e a tabela
 * de notas cresce indefinidamente.
 */
/**
 * equals/hashCode/toString apenas pelo id.
 *
 * O @Data do Lombok inclui todos os campos, e relacionamentos bidirecionais
 * fazem o hashCode de uma entidade chamar o da outra em ciclo — foi o que
 * derrubou a ingestao de notas com StackOverflowError. Comparar entidade JPA
 * pelo id tambem evita tocar em colecao lazy so para calcular igualdade.
 */
@Entity
@Table(name = "market_usage_counters")
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
@NoArgsConstructor
public class MarketUsageCounter {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @EqualsAndHashCode.Include
    @ToString.Include
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    /** Primeiro dia do mês do ciclo. */
    @Column(name = "cycle_start", nullable = false)
    private LocalDate cycleStart;

    @Column(name = "invoices_ingested", nullable = false)
    private Integer invoicesIngested = 0;

    /** Notas recusadas por estouro de limite — mede a pressão de upgrade. */
    @Column(name = "invoices_rejected", nullable = false)
    private Integer invoicesRejected = 0;

    @Column(name = "items_ingested", nullable = false)
    private Integer itemsIngested = 0;

    @Column(name = "first_ingest_at")
    private LocalDateTime firstIngestAt;

    @Column(name = "last_ingest_at")
    private LocalDateTime lastIngestAt;

    /** Quando o teto foi atingido pela primeira vez neste ciclo. */
    @Column(name = "limit_reached_at")
    private LocalDateTime limitReachedAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
