package com.pdv2cloud.service.campaign;

import com.pdv2cloud.model.entity.Campaign;
import com.pdv2cloud.model.entity.CampaignProduct;
import com.pdv2cloud.repository.CampaignProductRepository;
import com.pdv2cloud.repository.CampaignRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Impacto de campanha ATRIBUÍDO aos produtos participantes.
 *
 * Diferença em relação ao {@link CampaignImpactService}, que continua existindo
 * para campanhas sem produtos vinculados: lá a medição é da loja inteira, aqui é
 * restrita aos itens da campanha. Isso muda a qualidade da resposta — um feriado
 * no meio da janela sobe a receita da loja toda e contaminava o número antigo,
 * enquanto o efeito nos produtos participantes vs a mesma janela do baseline é
 * atribuível.
 *
 * Três medidas que antes não existiam em lugar nenhum:
 *
 *  LIFT ATRIBUÍDO   Receita e quantidade dos produtos da campanha na janela
 *                   contra o período equivalente imediatamente anterior.
 *
 *  CANIBALIZAÇÃO    Os demais produtos da MESMA categoria perderam venda durante
 *                   a campanha? Promoção que só transfere venda de um item para
 *                   outro da mesma prateleira não gera receita nova — apenas
 *                   entrega margem de graça. É a pergunta que a auditoria (§10)
 *                   registrou como "não medida em lugar nenhum".
 *
 *  PÓS-JANELA       Nos dias seguintes ao fim, os produtos venderam ABAIXO do
 *                   normal? Queda pós-promoção indica antecipação de compra
 *                   (pantry loading): o cliente estocou barato e sumiu, então o
 *                   ganho da janela foi tomado do futuro, não criado.
 */
@Service
public class CampaignProductIntelligenceService {

    /** Dias observados após o fim para detectar antecipação de compra. */
    private static final int POST_WINDOW_DAYS = 14;

    /** Queda pós-janela a partir da qual se caracteriza pantry loading. */
    private static final double PANTRY_LOADING_THRESHOLD = -15.0;

    /** Perda dos concorrentes de categoria a partir da qual há canibalização. */
    private static final double CANNIBALIZATION_THRESHOLD = -10.0;

    private final CampaignRepository campaignRepository;
    private final CampaignProductRepository campaignProductRepository;
    private final NamedParameterJdbcTemplate jdbcTemplate;

    public CampaignProductIntelligenceService(
        CampaignRepository campaignRepository,
        CampaignProductRepository campaignProductRepository,
        NamedParameterJdbcTemplate jdbcTemplate
    ) {
        this.campaignRepository = campaignRepository;
        this.campaignProductRepository = campaignProductRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Análise atribuída de uma campanha.
     *
     * @return {@code null} quando a campanha não tem produtos vinculados — nesse
     *         caso o chamador deve usar o impacto de loja inteira, deixando
     *         claro que é uma medida menos precisa
     */
    @Transactional(readOnly = true)
    public CampaignAnalysis analyze(UUID marketId, UUID campaignId) {
        Campaign campaign = campaignRepository.findById(campaignId).orElse(null);
        if (campaign == null || campaign.getStartDate() == null || campaign.getEndDate() == null) {
            return null;
        }

        List<CampaignProduct> participants = campaignProductRepository.findByCampaignId(campaignId);
        if (participants.isEmpty()) {
            return null;
        }

        List<UUID> productIds = participants.stream()
            .map(cp -> cp.getProduct().getId())
            .toList();

        LocalDateTime start = campaign.getStartDate();
        LocalDateTime endExclusive = campaign.getEndDate().plusSeconds(1);
        long durationDays = Math.max(1, ChronoUnit.DAYS.between(
            start.toLocalDate(), campaign.getEndDate().toLocalDate()) + 1);

        LocalDateTime beforeStart = start.minusDays(durationDays);
        LocalDateTime afterEnd = endExclusive.plusDays(POST_WINDOW_DAYS);

        ProductAggregate before = aggregate(marketId, productIds, beforeStart, start);
        ProductAggregate during = aggregate(marketId, productIds, start, endExclusive);

        // A janela pós só é comparável se já tiver passado tempo suficiente.
        boolean postWindowComplete = LocalDateTime.now().isAfter(afterEnd);
        ProductAggregate after = postWindowComplete
            ? aggregate(marketId, productIds, endExclusive, afterEnd)
            : null;

        double revenueLift = growth(during.revenue(), before.revenue());
        double quantityLift = growth(during.quantity(), before.quantity());

        CategoryImpact cannibalization =
            measureCannibalization(marketId, productIds, beforeStart, start, endExclusive, durationDays);

        Double postWindowChange = null;
        if (after != null) {
            // Normaliza pela duração: a janela pós tem tamanho fixo e a campanha não.
            double dailyDuring = during.quantity().doubleValue() / durationDays;
            double dailyAfter = after.quantity().doubleValue() / POST_WINDOW_DAYS;
            double dailyBefore = before.quantity().doubleValue() / durationDays;
            postWindowChange = dailyBefore > 0
                ? (dailyAfter - dailyBefore) / dailyBefore * 100.0
                : (dailyAfter > 0 ? 100.0 : 0.0);
        }

        String verdict = buildVerdict(revenueLift, cannibalization, postWindowChange);

        return new CampaignAnalysis(
            campaign.getId(),
            campaign.getName(),
            productIds.size(),
            before.revenue(), during.revenue(),
            after != null ? after.revenue() : null,
            before.quantity(), during.quantity(),
            after != null ? after.quantity() : null,
            round(revenueLift), round(quantityLift),
            cannibalization,
            postWindowChange != null ? round(postWindowChange) : null,
            postWindowComplete,
            verdict
        );
    }

    // ── Canibalização ────────────────────────────────────────────────────────

    /**
     * Mede o que aconteceu com os DEMAIS produtos das mesmas categorias durante
     * a campanha.
     *
     * A comparação é a mesma técnica do efeito halo, com o sinal invertido: se
     * os vizinhos de prateleira caíram enquanto o item promovido subiu, boa
     * parte do "ganho" foi apenas transferência dentro da própria loja.
     */
    private CategoryImpact measureCannibalization(
        UUID marketId, List<UUID> productIds,
        LocalDateTime beforeStart, LocalDateTime start,
        LocalDateTime endExclusive, long durationDays
    ) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("productIds", productIds)
            .addValue("beforeStart", Timestamp.valueOf(beforeStart))
            .addValue("start", Timestamp.valueOf(start))
            .addValue("endExclusive", Timestamp.valueOf(endExclusive));

        /*
         * "Concorrentes" = produtos das mesmas categorias dos participantes,
         * excluindo os próprios participantes.
         */
        String sql =
            "with campaign_categories as ( " +
            "  select distinct p.category " +
            "  from products p where p.id in (:productIds) and p.category is not null " +
            "), " +
            "competitors as ( " +
            "  select p.id from products p " +
            "  join campaign_categories cc on cc.category = p.category " +
            "  where p.id not in (:productIds) " +
            "), " +
            "sales as ( " +
            "  select " +
            "    sum(case when i.data_emissao >= :beforeStart and i.data_emissao < :start " +
            "             then it.quantidade else 0 end) as qty_before, " +
            "    sum(case when i.data_emissao >= :start and i.data_emissao < :endExclusive " +
            "             then it.quantidade else 0 end) as qty_during, " +
            "    sum(case when i.data_emissao >= :beforeStart and i.data_emissao < :start " +
            "             then it.valor_total else 0 end) as revenue_before, " +
            "    sum(case when i.data_emissao >= :start and i.data_emissao < :endExclusive " +
            "             then it.valor_total else 0 end) as revenue_during " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  join competitors c on c.id = it.product_id " +
            "  where i.market_id = :marketId " +
            "    and i.data_emissao >= :beforeStart and i.data_emissao < :endExclusive " +
            ") " +
            "select coalesce(qty_before, 0) as qty_before, coalesce(qty_during, 0) as qty_during, " +
            "       coalesce(revenue_before, 0) as revenue_before, " +
            "       coalesce(revenue_during, 0) as revenue_during " +
            "from sales";

        final BigDecimal[] values = { BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO };
        jdbcTemplate.query(sql, params, rs -> {
            values[0] = nonNull(rs.getBigDecimal("qty_before"));
            values[1] = nonNull(rs.getBigDecimal("qty_during"));
            values[2] = nonNull(rs.getBigDecimal("revenue_before"));
            values[3] = nonNull(rs.getBigDecimal("revenue_during"));
        });

        double qtyChange = growth(values[1], values[0]);
        double revenueChange = growth(values[3], values[2]);
        boolean detected = qtyChange <= CANNIBALIZATION_THRESHOLD;

        return new CategoryImpact(
            values[2], values[3], round(revenueChange), round(qtyChange), detected);
    }

    // ── Veredito ─────────────────────────────────────────────────────────────

    /**
     * Texto determinístico que interpreta os três sinais juntos.
     *
     * Mantém o padrão de linguagem do buildReason do capital: números primeiro,
     * conclusão em seguida, sem prometer causalidade que a medição não sustenta.
     */
    private String buildVerdict(double revenueLift, CategoryImpact cannibalization, Double postWindowChange) {
        StringBuilder verdict = new StringBuilder();

        if (revenueLift > 0) {
            verdict.append(String.format(
                "Os produtos da campanha faturaram %+.1f%% em relação ao período anterior.", revenueLift));
        } else {
            verdict.append(String.format(
                "Os produtos da campanha faturaram %+.1f%% — a campanha não elevou a receita deles.", revenueLift));
        }

        if (cannibalization.detected()) {
            verdict.append(String.format(
                " Atenção: os demais itens da mesma categoria caíram %.1f%% no período, "
                    + "então parte do resultado é transferência de venda dentro da própria loja, não receita nova.",
                Math.abs(cannibalization.quantityChangePercent().doubleValue())));
        } else {
            verdict.append(" Os demais itens da categoria não perderam venda relevante, "
                + "o que indica ganho incremental e não apenas troca de item.");
        }

        if (postWindowChange != null) {
            if (postWindowChange <= PANTRY_LOADING_THRESHOLD) {
                verdict.append(String.format(
                    " Nos %d dias seguintes a venda ficou %.1f%% abaixo do normal: o cliente antecipou compra "
                        + "(estocou no desconto), então parte do volume foi tomada do futuro.",
                    POST_WINDOW_DAYS, Math.abs(postWindowChange)));
            } else if (postWindowChange >= 0) {
                verdict.append(String.format(
                    " A venda se manteve %+.1f%% após o fim da campanha, sinal de que a promoção "
                        + "trouxe demanda nova e não apenas antecipação.", postWindowChange));
            }
        }

        return verdict.toString();
    }

    // ── Consultas de apoio ───────────────────────────────────────────────────

    private ProductAggregate aggregate(
        UUID marketId, List<UUID> productIds, LocalDateTime start, LocalDateTime endExclusive
    ) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("productIds", productIds)
            .addValue("start", Timestamp.valueOf(start))
            .addValue("end", Timestamp.valueOf(endExclusive));

        return jdbcTemplate.queryForObject(
            "select coalesce(sum(it.valor_total), 0) as revenue, " +
            "       coalesce(sum(it.quantidade), 0) as quantity, " +
            "       count(distinct i.id) as transactions " +
            "from invoice_items it " +
            "join invoices i on i.id = it.invoice_id " +
            "where i.market_id = :marketId " +
            "  and it.product_id in (:productIds) " +
            "  and i.data_emissao >= :start and i.data_emissao < :end",
            params,
            (rs, rowNum) -> new ProductAggregate(
                nonNull(rs.getBigDecimal("revenue")),
                nonNull(rs.getBigDecimal("quantity")),
                rs.getLong("transactions")
            )
        );
    }

    private double growth(BigDecimal current, BigDecimal previous) {
        if (previous == null || previous.compareTo(BigDecimal.ZERO) == 0) {
            return current != null && current.compareTo(BigDecimal.ZERO) > 0 ? 100.0 : 0.0;
        }
        return current.subtract(previous)
            .divide(previous, 4, RoundingMode.HALF_UP)
            .multiply(BigDecimal.valueOf(100))
            .doubleValue();
    }

    private BigDecimal round(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal nonNull(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    private record ProductAggregate(BigDecimal revenue, BigDecimal quantity, long transactions) {
    }

    /** O que aconteceu com os concorrentes de categoria durante a campanha. */
    public record CategoryImpact(
        BigDecimal revenueBefore,
        BigDecimal revenueDuring,
        BigDecimal revenueChangePercent,
        BigDecimal quantityChangePercent,
        boolean detected
    ) {}

    public record CampaignAnalysis(
        UUID campaignId,
        String campaignName,
        int productCount,
        BigDecimal revenueBefore, BigDecimal revenueDuring, BigDecimal revenueAfter,
        BigDecimal quantityBefore, BigDecimal quantityDuring, BigDecimal quantityAfter,
        BigDecimal revenueLiftPercent, BigDecimal quantityLiftPercent,
        CategoryImpact cannibalization,
        BigDecimal postWindowChangePercent,
        boolean postWindowComplete,
        String verdict
    ) {}
}
