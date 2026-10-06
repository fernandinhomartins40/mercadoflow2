package com.pdv2cloud.service.ai.agents;

import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.service.opportunity.RecommendationOrderService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/**
 * Molde dos agentes que juntam as recomendações do motor de um tipo de ação
 * (liquidar, ajustar preço, promover) numa decisão só. Aprovar aceita cada
 * recomendação pelo mesmo caminho da Central, e o resultado é medido depois
 * pela avaliação de resultados. Nada muda no caixa: preço e promoção são
 * aplicados pela loja.
 */
abstract class RecommendationBundleAgent implements CopilotAgent {

    private static final Logger log = LoggerFactory.getLogger(RecommendationBundleAgent.class);
    static final int SHOW = 6;

    protected final NamedParameterJdbcTemplate jdbc;
    protected final RecommendationOrderService orders;

    RecommendationBundleAgent(NamedParameterJdbcTemplate jdbc, RecommendationOrderService orders) {
        this.jdbc = jdbc;
        this.orders = orders;
    }

    /** Tipos de ação do motor que este agente cuida. */
    abstract List<String> actionTypes();

    abstract String kind();

    abstract String title(int count, BigDecimal impact);

    /** Linha de cada produto no texto pronto. */
    abstract String line(Map<String, Object> rec);

    abstract String closing();

    @Override
    public List<AgentSignal> signals(UUID marketId) {
        List<Map<String, Object>> recs = jdbc.queryForList(
            "select id, title, action_type, parameters::text as params, parameters->>'produtoId' as produto, "
                + "parameters->>'descontoPercent' as desconto, parameters->>'precoAtual' as preco, parameters->>'precoReferencia' as referencia, "
                + "parameters->>'valorEstoque' as estoque, parameters->>'coberturaDias' as cobertura, expected_impact_value "
                + "from recommendations where market_id = :m and status = 'PROPOSTA' and action_type in (:t) and exists (select 1 from opportunities op where op.id = recommendations.opportunity_id and op.status in ('NOVA', 'VISTA', 'EM_ACAO')) "
                + "order by expected_impact_value desc nulls last, id limit 30",
            new MapSqlParameterSource().addValue("m", marketId).addValue("t", actionTypes()));
        if (recs.isEmpty()) {
            return List.of();
        }
        BigDecimal impact = BigDecimal.ZERO;
        StringBuilder body = new StringBuilder();
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < recs.size(); i++) {
            Map<String, Object> r = recs.get(i);
            ids.add(String.valueOf(r.get("id")));
            impact = impact.add(ComprasAgent.decimal(r.get("expected_impact_value")));
            if (i < SHOW) {
                body.append(i == 0 ? "" : "\n").append("• ").append(line(r));
            }
        }
        if (recs.size() > SHOW) {
            body.append("\n• e mais ").append(recs.size() - SHOW).append(recs.size() - SHOW == 1 ? " produto" : " produtos");
        }
        body.append('\n').append(closing());
        Map<String, Object> numbers = new LinkedHashMap<>();
        numbers.put("produtos", recs.size());
        numbers.put("retornoEsperado", impact);
        String key = recs.stream().map(r -> String.valueOf(r.get("id"))).sorted().collect(Collectors.joining(","));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("recommendationIds", ids);
        payload.put("productIds", recs.stream().map(r -> r.get("produto")).filter(java.util.Objects::nonNull).map(String::valueOf).toList());
        return List.of(new AgentSignal(name(), kind(), name().toLowerCase(), title(recs.size(), impact), body.toString(), numbers,
            payload, impact.signum() > 0 ? impact : null, true, key));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> execute(UUID marketId, Map<String, Object> payload, String actor) {
        int accepted = 0;
        int skipped = 0;
        for (String id : (List<String>) payload.getOrDefault("recommendationIds", List.of())) {
            try {
                orders.decide(marketId, UUID.fromString(id), Recommendation.Status.ACEITA, actor,
                    "Aprovado no Copiloto (agente " + name().toLowerCase() + ")", null);
                accepted++;
            } catch (RuntimeException e) {
                log.debug("Recomendação {} já decidida: {}", id, e.getMessage());
                skipped++;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("aceitas", accepted);
        out.put("jaDecididas", skipped);
        return out;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> undo(UUID marketId, Map<String, Object> payload, Map<String, Object> result, String actor) {
        int undone = 0;
        int kept = 0;
        for (String id : (List<String>) payload.getOrDefault("recommendationIds", List.of())) {
            try {
                RecommendationOrderService.UndoResult r = orders.undo(marketId, UUID.fromString(id), actor);
                undone++;
                if (r.orderKept()) {
                    kept++;
                }
            } catch (RuntimeException e) {
                // Ainda proposta, já medida ou removida: nada a desfazer neste item.
            }
        }
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("desfeitas", undone);
        out.put("pedidoMantido", kept);
        return out;
    }

    static String pct(Object v) {
        BigDecimal b = ComprasAgent.decimal(v);
        return b.stripTrailingZeros().toPlainString().replace('.', ',') + "%";
    }
}
