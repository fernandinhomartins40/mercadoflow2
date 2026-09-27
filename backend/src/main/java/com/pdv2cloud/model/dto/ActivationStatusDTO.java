package com.pdv2cloud.model.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Estado de ativação do mercado: do agente conectado até a loja ter dias de
 * venda suficientes para o Painel fazer sentido (R-03).
 *
 * Datas com fuso: o container roda em UTC e um LocalDateTime chegaria ao
 * navegador sem fuso, lido como hora local — "último sinal há 0 min" com o
 * agente fora do ar há horas, e a análise das 03:30 UTC anunciada como 03:30
 * de Brasília.
 */
public record ActivationStatusDTO(
    boolean complete,
    List<Step> steps,
    Agent agent,
    Invoices invoices,
    OffsetDateTime nextAnalysisAt
) {

    public enum StepKey { CONNECT_AGENT, FIRST_INVOICE, FIRST_ANALYSIS }

    public record Step(StepKey key, boolean done, OffsetDateTime doneAt) {}

    public record Agent(int pairedPdvs, OffsetDateTime lastHeartbeatAt, boolean online) {}

    public record Invoices(int received, int salesDays, int targetDays, int rejectedLast7Days) {}
}
