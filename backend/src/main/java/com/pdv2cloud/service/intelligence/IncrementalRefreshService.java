package com.pdv2cloud.service.intelligence;

import com.pdv2cloud.service.opportunity.OpportunityEngine;
import com.pdv2cloud.service.opportunity.RecommendationEngine;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mantém a inteligência fresca ao longo do dia, no ritmo de cada loja.
 *
 * O PROBLEMA QUE RESOLVE: o supermercadista atende fornecedor a qualquer hora do
 * dia e precisa decidir o pedido ali. Com a materialização rodando só às 03:00,
 * ele decidia sobre uma prateleira que existia ontem — se um produto vendeu
 * forte à noite, o sistema ainda achava que havia cobertura.
 *
 * COMO O CUSTO É CONTROLADO: o ciclo processa apenas os produtos com venda
 * DESDE A ÚLTIMA RODADA. Numa loja movimentada isso são dezenas de SKUs, não os
 * 8 mil do catálogo — o custo escala com o movimento, não com o tamanho da loja.
 * Sem venda nova, o ciclo custa uma consulta e termina.
 *
 * O QUE FICA PARA O JOB NOTURNO: o que muda devagar e precisa de janela longa —
 * halo (180 dias), sazonalidade (365), classificação ABC do portfólio inteiro.
 * Recalcular isso a cada 10 minutos seria desperdício, porque a resposta é a
 * mesma.
 *
 * O QUE ATUALIZA AQUI: giro, cobertura, risco de ruptura e quantidade sugerida
 * — exatamente os números que mudam a cada venda e sustentam a decisão de
 * compra.
 */
@Service
@Slf4j
public class IncrementalRefreshService {

    /**
     * Teto de produtos por ciclo.
     *
     * Numa rajada anormal (importação em massa, reprocessamento), o ciclo
     * degrada para "atualiza os mais relevantes agora, o resto no próximo" em
     * vez de travar o banco por minutos.
     */
    private static final int MAX_PRODUCTS_PER_CYCLE = 500;

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final ProductIntelligenceMaterializer materializer;
    private final StoreRhythmService storeRhythmService;
    private final OpportunityEngine opportunityEngine;
    private final RecommendationEngine recommendationEngine;

    public IncrementalRefreshService(
        NamedParameterJdbcTemplate jdbcTemplate,
        ProductIntelligenceMaterializer materializer,
        StoreRhythmService storeRhythmService,
        OpportunityEngine opportunityEngine,
        RecommendationEngine recommendationEngine
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.materializer = materializer;
        this.storeRhythmService = storeRhythmService;
        this.opportunityEngine = opportunityEngine;
        this.recommendationEngine = recommendationEngine;
    }

    public record RefreshResult(
        UUID marketId,
        StoreRhythmService.Rhythm rhythm,
        int invoicesSinceLastRun,
        int productsTouched,
        int opportunitiesCreated,
        int recommendationsCreated,
        int nextIntervalMinutes,
        boolean skipped,
        String reason,
        long durationMillis
    ) {}

    /**
     * Executa um ciclo para o mercado, se for a hora dele.
     *
     * A decisão de rodar ou não é do próprio serviço, com base no ritmo da loja
     * — o job apenas oferece a oportunidade a cada poucos minutos.
     */
    @Transactional
    public RefreshResult refreshMarket(UUID marketId) {
        long startedAt = System.currentTimeMillis();
        LocalDateTime now = LocalDateTime.now();

        RefreshState state = loadState(marketId);
        if (state.nextRunAt() != null && now.isBefore(state.nextRunAt())) {
            return new RefreshResult(marketId, null, 0, 0, 0, 0, 0, true,
                "Ainda não é hora deste mercado", System.currentTimeMillis() - startedAt);
        }

        LocalDateTime since = state.lastIncrementalAt() != null
            ? state.lastIncrementalAt()
            : now.minusHours(24);

        int newInvoices = countInvoicesSince(marketId, since);
        boolean hasNewSales = newInvoices > 0;

        StoreRhythmService.RhythmDecision decision =
            storeRhythmService.decide(marketId, hasNewSales);

        if (!hasNewSales) {
            // Nada mudou: não há o que recalcular. Só reagenda.
            saveState(marketId, state, decision, 0, 0, now, false);
            return new RefreshResult(
                marketId, decision.rhythm(), 0, 0, 0, 0, decision.intervalMinutes(),
                true, decision.reason(), System.currentTimeMillis() - startedAt);
        }

        List<UUID> touched = productsSoldSince(marketId, since);

        /*
         * A materialização do capital é feita para o portfólio inteiro, porque
         * ABC e participação de receita são classificações RELATIVAS — não
         * existe recálculo isolado por SKU que produza o mesmo número.
         *
         * O ganho do incremental está em PULAR a loja quando nada vendeu, que é
         * a maior parte dos ciclos: madrugada, domingo fechado, hora morta.
         * Quando há movimento, recalcular é o trabalho legítimo.
         */
        materializer.materializeMarket(marketId);

        OpportunityEngine.DetectionResult detection = opportunityEngine.detectForMarket(marketId);
        int recommendations = recommendationEngine.generateForMarket(marketId);

        saveState(marketId, state, decision, newInvoices, touched.size(), now, true);

        return new RefreshResult(
            marketId, decision.rhythm(), newInvoices, touched.size(),
            detection.created(), recommendations, decision.intervalMinutes(),
            false, decision.reason(), System.currentTimeMillis() - startedAt);
    }

    // ── Estado ───────────────────────────────────────────────────────────────

    private record RefreshState(
        LocalDateTime lastIncrementalAt,
        LocalDateTime nextRunAt,
        int consecutiveIdleCycles
    ) {}

    private RefreshState loadState(UUID marketId) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId);
        final RefreshState[] found = { new RefreshState(null, null, 0) };

        jdbcTemplate.query(
            "select last_incremental_at, next_run_at, consecutive_idle_cycles "
                + "from market_refresh_state where market_id = :marketId",
            params,
            rs -> {
                found[0] = new RefreshState(
                    rs.getTimestamp("last_incremental_at") != null
                        ? rs.getTimestamp("last_incremental_at").toLocalDateTime() : null,
                    rs.getTimestamp("next_run_at") != null
                        ? rs.getTimestamp("next_run_at").toLocalDateTime() : null,
                    rs.getInt("consecutive_idle_cycles"));
            });
        return found[0];
    }

    private void saveState(
        UUID marketId, RefreshState previous, StoreRhythmService.RhythmDecision decision,
        int invoices, int products, LocalDateTime now, boolean didWork
    ) {
        int idleCycles = didWork ? 0 : previous.consecutiveIdleCycles() + 1;

        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("lastIncrementalAt", didWork ? now : previous.lastIncrementalAt())
            .addValue("nextRunAt", now.plusMinutes(decision.intervalMinutes()))
            .addValue("rhythm", decision.rhythm().name())
            .addValue("intervalMinutes", decision.intervalMinutes())
            .addValue("invoices", invoices)
            .addValue("products", products)
            .addValue("idleCycles", idleCycles)
            .addValue("now", now);

        jdbcTemplate.update(
            "insert into market_refresh_state ( "
                + "  market_id, last_incremental_at, next_run_at, rhythm, last_interval_minutes, "
                + "  invoices_last_cycle, products_last_cycle, consecutive_idle_cycles, updated_at) "
                + "values (:marketId, :lastIncrementalAt, :nextRunAt, :rhythm, :intervalMinutes, "
                + "        :invoices, :products, :idleCycles, :now) "
                + "on conflict (market_id) do update set "
                + "  last_incremental_at = excluded.last_incremental_at, "
                + "  next_run_at = excluded.next_run_at, "
                + "  rhythm = excluded.rhythm, "
                + "  last_interval_minutes = excluded.last_interval_minutes, "
                + "  invoices_last_cycle = excluded.invoices_last_cycle, "
                + "  products_last_cycle = excluded.products_last_cycle, "
                + "  consecutive_idle_cycles = excluded.consecutive_idle_cycles, "
                + "  updated_at = excluded.updated_at",
            params);
    }

    // ── Consultas de movimento ───────────────────────────────────────────────

    /**
     * Usa {@code processed_at} e não {@code data_emissao}: o que importa é
     * quando a nota CHEGOU ao sistema, não quando foi emitida. Uma nota antiga
     * reenviada pelo agente precisa entrar no ciclo.
     */
    private int countInvoicesSince(UUID marketId, LocalDateTime since) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("since", since);

        Integer count = jdbcTemplate.queryForObject(
            "select count(*) from invoices "
                + "where market_id = :marketId and processed_at > :since",
            params, Integer.class);
        return count != null ? count : 0;
    }

    private List<UUID> productsSoldSince(UUID marketId, LocalDateTime since) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("since", since)
            .addValue("limit", MAX_PRODUCTS_PER_CYCLE);

        return jdbcTemplate.queryForList(
            "select distinct it.product_id from invoice_items it "
                + "join invoices i on i.id = it.invoice_id "
                + "where i.market_id = :marketId and i.processed_at > :since "
                + "  and it.product_id is not null "
                + "limit :limit",
            params, UUID.class);
    }
}
