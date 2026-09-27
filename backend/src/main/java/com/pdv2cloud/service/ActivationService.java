package com.pdv2cloud.service;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pdv2cloud.model.dto.ActivationStatusDTO;
import com.pdv2cloud.model.dto.ActivationStatusDTO.Agent;
import com.pdv2cloud.model.dto.ActivationStatusDTO.Invoices;
import com.pdv2cloud.model.dto.ActivationStatusDTO.Step;
import com.pdv2cloud.model.dto.ActivationStatusDTO.StepKey;
import com.pdv2cloud.model.entity.AgentApiKey;
import com.pdv2cloud.repository.AgentApiKeyRepository;
import com.pdv2cloud.repository.MarketRepository;

/**
 * Onde a loja está no caminho até a primeira análise (R-03, UX-C04).
 *
 * Cada passo é lido do estado real — chave de agente, first_ingest_at, marco da
 * primeira análise — e não de um cadastro manual, para o checklist nunca dizer
 * "feito" antes de estar feito. "Instalar" e "conectar" são um passo só: a
 * sessão de pareamento só ganha mercado na aprovação (D-035).
 */
@Service
public class ActivationService {

    /** Dias de venda a partir dos quais o Painel deixa de ser "coletando". */
    public static final int TARGET_SALES_DAYS = 7;
    /** Heartbeat mais velho que isto: agente considerado fora do ar. */
    static final int ONLINE_MINUTES = 15;
    /** Horário do OpportunityDetectionJob (cron "0 30 3 * * ?"). */
    static final LocalTime ANALYSIS_TIME = LocalTime.of(3, 30);

    private final MarketRepository marketRepository;
    private final AgentApiKeyRepository agentApiKeyRepository;
    private final ProductEventService productEventService;
    private final NamedParameterJdbcTemplate jdbc;

    public ActivationService(
        MarketRepository marketRepository,
        AgentApiKeyRepository agentApiKeyRepository,
        ProductEventService productEventService,
        NamedParameterJdbcTemplate jdbc
    ) {
        this.marketRepository = marketRepository;
        this.agentApiKeyRepository = agentApiKeyRepository;
        this.productEventService = productEventService;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public ActivationStatusDTO getStatus(UUID marketId) {
        List<AgentApiKey> keys = agentApiKeyRepository.findByMarketIdAndIsActiveTrue(marketId);
        LocalDateTime firstIngestAt = marketRepository.findById(marketId)
            .map(m -> m.getFirstIngestAt())
            .orElse(null);
        LocalDateTime firstAnalysisAt = productEventService
            .firstOccurrence(marketId, ProductEventService.ACTIVATION_FIRST_ANALYSIS)
            .orElse(null);

        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId);
        int rejected = count(
            "select count(*) from invoice_rejections where market_id = :marketId "
                + "and resolved_at is null and last_attempt_at >= now() - interval '7 days'", params);

        int received = 0;
        int salesDays = 0;
        if (firstIngestAt != null) {
            // Os dois limites mantêm a consulta curta numa loja grande: aqui só
            // interessa saber se passou do alvo, não o total exato.
            received = count(
                "select count(*) from (select 1 from invoices where market_id = :marketId limit 10000) x", params);
            salesDays = count(
                "select count(*) from (select distinct cast(data_emissao as date) from invoices "
                    + "where market_id = :marketId and data_emissao >= now() - interval '30 days' "
                    + "limit " + (TARGET_SALES_DAYS + 1) + ") d", params);
        }

        Snapshot snapshot = new Snapshot(
            keys.size(),
            keys.stream().map(AgentApiKey::getCreatedAt).filter(Objects::nonNull)
                .min(Comparator.naturalOrder()).orElse(null),
            keys.stream().map(AgentApiKey::getLastHeartbeatAt).filter(Objects::nonNull)
                .max(Comparator.naturalOrder()).orElse(null),
            (int) keys.stream().map(k -> k.getPdv() == null ? null : k.getPdv().getId())
                .filter(Objects::nonNull).distinct().count(),
            firstIngestAt,
            firstAnalysisAt,
            received,
            salesDays,
            rejected);
        return build(snapshot, LocalDateTime.now());
    }

    private int count(String sql, MapSqlParameterSource params) {
        Integer value = jdbc.queryForObject(sql, params, Integer.class);
        return value == null ? 0 : value;
    }

    /** Dados brutos lidos do banco; separados para o cálculo ser testável sem banco. */
    record Snapshot(
        int activeKeys,
        LocalDateTime firstKeyCreatedAt,
        LocalDateTime lastHeartbeatAt,
        int pairedPdvs,
        LocalDateTime firstIngestAt,
        LocalDateTime firstAnalysisAt,
        int received,
        int salesDays,
        int rejectedLast7Days
    ) {}

    static ActivationStatusDTO build(Snapshot s, LocalDateTime now) {
        boolean firstInvoice = s.firstIngestAt() != null;
        boolean firstAnalysis = s.firstAnalysisAt() != null;
        // Nota recebida prova que o agente foi conectado, mesmo que a chave tenha
        // sido revogada depois: uma loja com histórico não volta ao checklist.
        boolean connected = s.activeKeys() > 0 || firstInvoice;
        LocalDateTime connectedAt = s.firstKeyCreatedAt() != null ? s.firstKeyCreatedAt() : s.firstIngestAt();

        List<Step> steps = List.of(
            new Step(StepKey.CONNECT_AGENT, connected, connected ? withZone(connectedAt) : null),
            new Step(StepKey.FIRST_INVOICE, firstInvoice, withZone(s.firstIngestAt())),
            new Step(StepKey.FIRST_ANALYSIS, firstAnalysis, withZone(s.firstAnalysisAt())));

        boolean online = s.lastHeartbeatAt() != null
            && !s.lastHeartbeatAt().isBefore(now.minusMinutes(ONLINE_MINUTES));
        int pdvs = Math.max(s.pairedPdvs(), s.activeKeys() > 0 ? 1 : 0);

        boolean complete = connected && firstInvoice && firstAnalysis
            && s.salesDays() >= TARGET_SALES_DAYS;

        LocalDateTime nextAnalysis = firstAnalysis ? null : nextAnalysisAfter(now);

        return new ActivationStatusDTO(
            complete,
            steps,
            new Agent(pdvs, withZone(s.lastHeartbeatAt()), online),
            new Invoices(s.received(), Math.min(s.salesDays(), TARGET_SALES_DAYS), TARGET_SALES_DAYS,
                s.rejectedLast7Days()),
            withZone(nextAnalysis));
    }

    /** Horários do banco e do cron estão no fuso da JVM (UTC no container). */
    static OffsetDateTime withZone(LocalDateTime at) {
        return at == null ? null : at.atZone(ZoneId.systemDefault()).toOffsetDateTime();
    }

    static LocalDateTime nextAnalysisAfter(LocalDateTime now) {
        LocalDateTime today = now.toLocalDate().atTime(ANALYSIS_TIME);
        return now.isBefore(today) ? today : today.plusDays(1);
    }
}
