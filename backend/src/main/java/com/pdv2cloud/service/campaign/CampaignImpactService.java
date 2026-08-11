package com.pdv2cloud.service.campaign;

import com.pdv2cloud.model.dto.CampaignImpactDTO;
import com.pdv2cloud.model.entity.Campaign;
import com.pdv2cloud.repository.CampaignRepository;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Impacto de campanhas manuais: compara receita, transações e ticket médio nas
 * janelas ANTES / DURANTE / DEPOIS da campanha.
 *
 * Extraído do AdvancedAnalyticsService na Fase 1 da evolução da inteligência.
 *
 * LIMITAÇÃO CONHECIDA (documentada na auditoria, §10): {@link Campaign} não tem
 * produtos vinculados, então o impacto é medido sobre a receita da LOJA INTEIRA.
 * Qualquer feriado ou evento externo dentro da janela contamina o resultado, e
 * não há como atribuir o efeito à campanha nem medir canibalização. A correção
 * exige a tabela campaign_products (Fase 2 do plano) — quando ela existir, o
 * cálculo passa a ser restrito aos produtos da campanha e reaproveita o
 * PromoEffectivenessService.
 */
@Service
public class CampaignImpactService {

    @Autowired
    private CampaignRepository campaignRepository;

    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    /** Impacto de todas as campanhas do mercado, mais recentes primeiro. */
    public List<CampaignImpactDTO> getCampaignImpacts(UUID marketId) {
        return campaignRepository.findByMarketId(marketId).stream()
            .filter(c -> c.getStartDate() != null && c.getEndDate() != null)
            .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
            .map(campaign -> computeCampaignImpact(marketId, campaign))
            .toList();
    }

    /** Campanhas em execução neste momento. */
    public long countRunningCampaigns(UUID marketId) {
        LocalDateTime now = LocalDateTime.now();
        return campaignRepository.findByMarketId(marketId).stream()
            .filter(c -> c.getStartDate() != null && c.getEndDate() != null)
            .filter(c -> !now.isBefore(c.getStartDate()) && !now.isAfter(c.getEndDate()))
            .count();
    }

    /**
     * As janelas de comparação têm a MESMA duração da campanha, imediatamente
     * antes e depois — é o que torna os três números comparáveis entre si.
     */
    private CampaignImpactDTO computeCampaignImpact(UUID marketId, Campaign campaign) {
        LocalDateTime start = campaign.getStartDate();
        LocalDateTime endExclusive = campaign.getEndDate().plusSeconds(1);
        long durationDays = Math.max(1,
            ChronoUnit.DAYS.between(start.toLocalDate(), campaign.getEndDate().toLocalDate()) + 1);
        LocalDateTime beforeStart = start.minusDays(durationDays);
        LocalDateTime afterEnd = endExclusive.plusDays(durationDays);

        Aggregate before = aggregateInvoices(marketId, beforeStart, start);
        Aggregate during = aggregateInvoices(marketId, start, endExclusive);
        Aggregate after = aggregateInvoices(marketId, endExclusive, afterEnd);

        LocalDateTime now = LocalDateTime.now();
        String status = now.isBefore(start) ? "SCHEDULED"
            : now.isAfter(campaign.getEndDate()) ? "ENDED"
            : "RUNNING";

        return new CampaignImpactDTO(
            campaign.getId(),
            campaign.getName(),
            campaign.getDescription(),
            campaign.getStartDate(),
            campaign.getEndDate(),
            status,
            (int) durationDays,
            before.revenue(),
            during.revenue(),
            after.revenue(),
            before.transactions(),
            during.transactions(),
            after.transactions(),
            before.averageTicket(),
            during.averageTicket(),
            after.averageTicket(),
            calculateGrowth(during.revenue(), before.revenue()),
            calculateGrowth(BigDecimal.valueOf(during.transactions()), BigDecimal.valueOf(before.transactions()))
        );
    }

    private Aggregate aggregateInvoices(UUID marketId, LocalDateTime start, LocalDateTime endExclusive) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("start", Timestamp.valueOf(start))
            .addValue("end", Timestamp.valueOf(endExclusive));

        return jdbcTemplate.queryForObject(
            "select coalesce(sum(i.valor_total), 0) as revenue, count(*) as transactions, " +
            "coalesce(sum(i.valor_total) / nullif(count(*), 0), 0) as average_ticket " +
            "from invoices i where i.market_id = :marketId and i.data_emissao >= :start and i.data_emissao < :end",
            params,
            (rs, rowNum) -> new Aggregate(
                defaultBigDecimal(rs.getBigDecimal("revenue")),
                rs.getLong("transactions"),
                defaultBigDecimal(rs.getBigDecimal("average_ticket"))
            )
        );
    }

    private double calculateGrowth(BigDecimal current, BigDecimal previous) {
        if (previous == null || previous.compareTo(BigDecimal.ZERO) == 0) {
            return current != null && current.compareTo(BigDecimal.ZERO) > 0 ? 100.0 : 0.0;
        }
        // Escala 4 para bater com o cálculo original do AdvancedAnalyticsService:
        // mudar a precisão aqui alteraria os percentuais já exibidos ao usuário.
        return current.subtract(previous)
            .divide(previous, 4, java.math.RoundingMode.HALF_UP)
            .multiply(BigDecimal.valueOf(100))
            .doubleValue();
    }

    private BigDecimal defaultBigDecimal(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    private record Aggregate(BigDecimal revenue, long transactions, BigDecimal averageTicket) {
    }
}
