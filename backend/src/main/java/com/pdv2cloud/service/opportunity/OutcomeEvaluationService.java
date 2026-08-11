package com.pdv2cloud.service.opportunity;

import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.model.entity.RecommendationOutcome;
import com.pdv2cloud.model.entity.RecommendationOutcome.Verdict;
import com.pdv2cloud.repository.RecommendationOutcomeRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mede o que aconteceu depois que o usuário decidiu.
 *
 * Fecha o último elo do ciclo: RESULTADO → APRENDIZADO. Sem esta medição, o
 * sistema recomendava para sempre sem nunca descobrir se acertava — e nenhum
 * peso de score tinha como se corrigir.
 *
 * COMO A MEDIÇÃO É FEITA, e por que assim:
 *
 *  - O baseline é congelado NO ATO da decisão ({@link #createPending}). Medir
 *    contra números recalculados depois compararia com um passado que já embute
 *    o efeito da própria decisão.
 *  - A janela "antes" tem a mesma duração da janela "depois". Comparar 14 dias
 *    com 30 mediria calendário, não efeito.
 *  - Cada tipo de ação tem sua própria pergunta: comprar acerta se o produto
 *    escoou; liquidar acerta se o capital saiu da prateleira; promover acerta
 *    se a receita subiu. Um veredito único para todos seria pouco honesto.
 */
@Service
@Slf4j
public class OutcomeEvaluationService {

    /** Horizonte padrão de medição. */
    private static final int DEFAULT_HORIZON_DAYS = 30;

    /**
     * Abaixo deste volume no período, não há o que julgar.
     *
     * Um produto que vendeu 2 unidades não valida nem invalida uma
     * recomendação — declarar SEM_DADOS é mais útil que inventar veredito.
     */
    private static final double MIN_UNITS_TO_JUDGE = 3.0;

    /** A partir de quanto do previsto o resultado conta como acerto. */
    private static final double SUCCESS_RATIO = 0.8;

    /** Abaixo disso é erro; entre os dois, parcial. */
    private static final double PARTIAL_RATIO = 0.3;

    private final RecommendationOutcomeRepository outcomeRepository;
    private final NamedParameterJdbcTemplate jdbcTemplate;

    public OutcomeEvaluationService(
        RecommendationOutcomeRepository outcomeRepository,
        NamedParameterJdbcTemplate jdbcTemplate
    ) {
        this.outcomeRepository = outcomeRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Registra o ponto de partida no momento em que a decisão é tomada.
     *
     * Chamado pelo RecommendationEngine ao aceitar uma recomendação. Rejeições
     * não geram outcome: não há ação para medir o efeito.
     */
    @Transactional
    public RecommendationOutcome createPending(Recommendation rec) {
        if (outcomeRepository.findByRecommendationId(rec.getId()).isPresent()) {
            return null;
        }

        UUID marketId = rec.getMarket().getId();
        UUID productId = rec.getOpportunity().getProduct() != null
            ? rec.getOpportunity().getProduct().getId()
            : null;

        RecommendationOutcome outcome = new RecommendationOutcome();
        outcome.setMarket(rec.getMarket());
        outcome.setRecommendation(rec);
        outcome.setProduct(rec.getOpportunity().getProduct());
        outcome.setActionType(rec.getActionType().name());
        outcome.setHorizonDays(DEFAULT_HORIZON_DAYS);
        outcome.setMeasureAfter(LocalDateTime.now().plusDays(DEFAULT_HORIZON_DAYS));
        outcome.setPredictedValue(rec.getExpectedImpactValue());
        outcome.setBaselineSnapshot(captureSnapshot(marketId, productId, DEFAULT_HORIZON_DAYS));
        outcome.setCreatedAt(LocalDateTime.now());

        return outcomeRepository.save(outcome);
    }

    /**
     * Mede todos os resultados vencidos de um mercado.
     *
     * @return quantos foram medidos
     */
    @Transactional
    public int evaluateDue(UUID marketId) {
        List<RecommendationOutcome> due =
            outcomeRepository.findDueForMeasurement(marketId, LocalDateTime.now());

        int measured = 0;
        for (RecommendationOutcome outcome : due) {
            try {
                measure(outcome);
                measured++;
            } catch (Exception e) {
                log.error("Falha ao medir resultado {} do mercado {}", outcome.getId(), marketId, e);
            }
        }
        return measured;
    }

    private void measure(RecommendationOutcome outcome) {
        UUID marketId = outcome.getMarket().getId();
        UUID productId = outcome.getProduct() != null ? outcome.getProduct().getId() : null;
        int horizon = outcome.getHorizonDays() != null ? outcome.getHorizonDays() : DEFAULT_HORIZON_DAYS;

        Map<String, Object> after = captureSnapshot(marketId, productId, horizon);
        outcome.setActualSnapshot(after);
        outcome.setMeasuredAt(LocalDateTime.now());

        Map<String, Object> before = outcome.getBaselineSnapshot() != null
            ? outcome.getBaselineSnapshot()
            : Map.of();

        double qtyBefore = num(before.get("quantidade"));
        double qtyAfter = num(after.get("quantidade"));
        double revenueBefore = num(before.get("receita"));
        double revenueAfter = num(after.get("receita"));

        if (qtyBefore < MIN_UNITS_TO_JUDGE && qtyAfter < MIN_UNITS_TO_JUDGE) {
            outcome.setVerdict(Verdict.SEM_DADOS);
            outcome.setNotes(
                "Volume insuficiente no período para avaliar: o produto praticamente não vendeu "
                    + "nem antes nem depois. A recomendação não pode ser julgada com esses dados.");
            outcomeRepository.save(outcome);
            return;
        }

        // Cada ação responde a uma pergunta diferente.
        switch (outcome.getActionType() != null ? outcome.getActionType() : "") {
            case "COMPRAR" -> evaluateBuy(outcome, qtyBefore, qtyAfter, revenueBefore, revenueAfter);
            case "LIQUIDAR" -> evaluateLiquidate(outcome, qtyBefore, qtyAfter);
            case "PROMOVER" -> evaluatePromote(outcome, revenueBefore, revenueAfter);
            case "AJUSTAR_PRECO" -> evaluatePrice(outcome, before, after, revenueBefore, revenueAfter);
            default -> evaluateGeneric(outcome, revenueBefore, revenueAfter);
        }
        outcomeRepository.save(outcome);
    }

    /** Comprar acerta quando o produto de fato escoou o volume reposto. */
    private void evaluateBuy(
        RecommendationOutcome o, double qtyBefore, double qtyAfter,
        double revenueBefore, double revenueAfter
    ) {
        double growth = pctChange(qtyAfter, qtyBefore);
        o.setActualValue(round(revenueAfter));
        o.setDeltaValue(round(revenueAfter - revenueBefore));
        o.setDeltaPercent(round(pctChange(revenueAfter, revenueBefore)));

        if (qtyAfter >= qtyBefore * SUCCESS_RATIO) {
            o.setVerdict(Verdict.ACERTOU);
            o.setNotes(String.format(
                "O produto manteve o giro após a reposição: %.0f un. no período contra %.0f antes "
                    + "(%+.0f%%). A compra foi absorvida pela demanda.",
                qtyAfter, qtyBefore, growth));
        } else if (qtyAfter >= qtyBefore * PARTIAL_RATIO) {
            o.setVerdict(Verdict.PARCIAL);
            o.setNotes(String.format(
                "O giro caiu para %.0f un. contra %.0f antes (%+.0f%%). Parte do estoque reposto "
                    + "ainda não escoou — considere um volume menor no próximo ciclo.",
                qtyAfter, qtyBefore, growth));
        } else {
            o.setVerdict(Verdict.ERROU);
            o.setNotes(String.format(
                "A demanda não sustentou a reposição: %.0f un. contra %.0f antes (%+.0f%%). "
                    + "O capital ficou na prateleira.",
                qtyAfter, qtyBefore, growth));
        }
    }

    /** Liquidar acerta quando o estoque de fato saiu — o giro precisa SUBIR. */
    private void evaluateLiquidate(RecommendationOutcome o, double qtyBefore, double qtyAfter) {
        double growth = pctChange(qtyAfter, qtyBefore);
        o.setActualValue(round(qtyAfter));
        o.setDeltaValue(round(qtyAfter - qtyBefore));
        o.setDeltaPercent(round(growth));

        if (qtyAfter > qtyBefore) {
            o.setVerdict(Verdict.ACERTOU);
            o.setNotes(String.format(
                "A liquidação girou o item: %.0f un. contra %.0f antes (%+.0f%%). "
                    + "O capital voltou a circular.",
                qtyAfter, qtyBefore, growth));
        } else if (qtyAfter >= qtyBefore * SUCCESS_RATIO) {
            o.setVerdict(Verdict.PARCIAL);
            o.setNotes(String.format(
                "O giro ficou estável (%.0f contra %.0f un.). A liquidação não acelerou a saída — "
                    + "talvez o desconto tenha sido raso demais para o problema.",
                qtyAfter, qtyBefore));
        } else {
            o.setVerdict(Verdict.ERROU);
            o.setNotes(String.format(
                "O item continuou parado mesmo após a ação: %.0f un. contra %.0f antes. "
                    + "Vale reavaliar se o produto tem demanda nesta loja.",
                qtyAfter, qtyBefore));
        }
    }

    /** Promover acerta quando a receita sobe — desconto sem receita é margem doada. */
    private void evaluatePromote(RecommendationOutcome o, double revenueBefore, double revenueAfter) {
        double growth = pctChange(revenueAfter, revenueBefore);
        o.setActualValue(round(revenueAfter));
        o.setDeltaValue(round(revenueAfter - revenueBefore));
        o.setDeltaPercent(round(growth));

        if (revenueAfter > revenueBefore) {
            o.setVerdict(Verdict.ACERTOU);
            o.setNotes(String.format(
                "A promoção gerou receita: %s contra %s antes (%+.0f%%).",
                money(revenueAfter), money(revenueBefore), growth));
        } else if (revenueAfter >= revenueBefore * SUCCESS_RATIO) {
            o.setVerdict(Verdict.PARCIAL);
            o.setNotes(String.format(
                "A receita ficou praticamente igual (%s contra %s). Houve mais volume pelo mesmo "
                    + "dinheiro — o desconto foi absorvido sem ganho.",
                money(revenueAfter), money(revenueBefore)));
        } else {
            o.setVerdict(Verdict.ERROU);
            o.setNotes(String.format(
                "A receita caiu: %s contra %s antes (%+.0f%%). O desconto não se pagou.",
                money(revenueAfter), money(revenueBefore), growth));
        }
    }

    /** Ajuste de preço acerta quando o volume reage sem destruir a receita. */
    private void evaluatePrice(
        RecommendationOutcome o, Map<String, Object> before, Map<String, Object> after,
        double revenueBefore, double revenueAfter
    ) {
        double priceBefore = num(before.get("precoMedio"));
        double priceAfter = num(after.get("precoMedio"));
        double growth = pctChange(revenueAfter, revenueBefore);

        o.setActualValue(round(revenueAfter));
        o.setDeltaValue(round(revenueAfter - revenueBefore));
        o.setDeltaPercent(round(growth));

        if (revenueAfter >= revenueBefore) {
            o.setVerdict(Verdict.ACERTOU);
            o.setNotes(String.format(
                "Preço médio foi de %s para %s e a receita %s (%+.0f%%). O ajuste não custou "
                    + "faturamento.",
                money(priceBefore), money(priceAfter),
                growth >= 0 ? "subiu" : "se manteve", growth));
        } else {
            o.setVerdict(Verdict.PARCIAL);
            o.setNotes(String.format(
                "Preço médio foi de %s para %s, com receita %+.0f%%. O volume não compensou a "
                    + "redução de preço no período medido.",
                money(priceBefore), money(priceAfter), growth));
        }
    }

    private void evaluateGeneric(RecommendationOutcome o, double revenueBefore, double revenueAfter) {
        double growth = pctChange(revenueAfter, revenueBefore);
        o.setActualValue(round(revenueAfter));
        o.setDeltaValue(round(revenueAfter - revenueBefore));
        o.setDeltaPercent(round(growth));
        o.setVerdict(revenueAfter >= revenueBefore ? Verdict.ACERTOU : Verdict.PARCIAL);
        o.setNotes(String.format(
            "Receita do item no período: %s contra %s antes (%+.0f%%).",
            money(revenueAfter), money(revenueBefore), growth));
    }

    /**
     * Fotografa quantidade, receita e preço médio do produto nos últimos
     * {@code days} dias.
     *
     * Sem produto (anomalia de loja, por exemplo), fotografa a loja inteira.
     */
    private Map<String, Object> captureSnapshot(UUID marketId, UUID productId, int days) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("since", LocalDateTime.now().minusDays(days));

        String sql = productId != null
            ? "select coalesce(sum(it.quantidade), 0) as quantidade, "
              + "       coalesce(sum(it.valor_total), 0) as receita, "
              + "       coalesce(sum(it.valor_total) / nullif(sum(it.quantidade), 0), 0) as preco_medio "
              + "from invoice_items it join invoices i on i.id = it.invoice_id "
              + "where i.market_id = :marketId and it.product_id = :productId "
              + "  and i.data_emissao >= :since"
            : "select 0 as quantidade, coalesce(sum(i.valor_total), 0) as receita, 0 as preco_medio "
              + "from invoices i "
              + "where i.market_id = :marketId and i.data_emissao >= :since";

        if (productId != null) {
            params.addValue("productId", productId);
        }

        Map<String, Object> snapshot = new LinkedHashMap<>();
        jdbcTemplate.query(sql, params, rs -> {
            snapshot.put("quantidade", rs.getDouble("quantidade"));
            snapshot.put("receita", rs.getDouble("receita"));
            snapshot.put("precoMedio", rs.getDouble("preco_medio"));
        });
        snapshot.put("janelaDias", days);
        snapshot.put("capturadoEm", LocalDateTime.now().toString());
        return snapshot;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private double num(Object value) {
        if (value == null) return 0.0;
        try {
            return Double.parseDouble(value.toString());
        } catch (NumberFormatException e) {
            return 0.0;
        }
    }

    private double pctChange(double current, double previous) {
        if (previous == 0) return current > 0 ? 100.0 : 0.0;
        return (current - previous) / previous * 100.0;
    }

    private BigDecimal round(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP);
    }

    private String money(double value) {
        return String.format("R$ %.2f", value);
    }
}
