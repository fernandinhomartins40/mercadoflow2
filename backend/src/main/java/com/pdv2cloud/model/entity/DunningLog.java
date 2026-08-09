package com.pdv2cloud.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Execução de uma regra da régua sobre uma fatura (ver V38__commercial_crm.sql).
 *
 * A restrição única (invoice, rule) é o que impede a régua de virar spam: o job
 * roda diariamente, e sem esse registro reenviaria a mesma cobrança a cada
 * rodada enquanto a fatura seguisse vencida.
 */
@Entity
@Table(name = "dunning_logs")
@Data
@NoArgsConstructor
public class DunningLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "invoice_id", nullable = false)
    private UUID invoiceId;

    @Column(name = "rule_id", nullable = false)
    private UUID ruleId;

    @Column(name = "market_id")
    private UUID marketId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private DunningRule.Action action;

    @Column(nullable = false)
    private Boolean success = true;

    @Column(length = 500)
    private String detail;

    @Column(name = "executed_at", nullable = false)
    private LocalDateTime executedAt = LocalDateTime.now();
}
