package com.pdv2cloud.service.ai.agents;

import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.service.opportunity.RecommendationOrderService;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Agente de Compras: junta as compras que o motor já recomendou (o que vai
 * acabar) num pedido só. Aprovado, cada item vai para o rascunho de pedido do
 * fornecedor pelo mesmo caminho da Central ("aceitar → pedido"). Nada é
 * enviado ao fornecedor: o pedido fica em rascunho para o comprador revisar.
 */
@Component
public class ComprasAgent implements CopilotAgent {

    private static final Logger log = LoggerFactory.getLogger(ComprasAgent.class);
    private static final Locale BR = Locale.forLanguageTag("pt-BR");
    private static final int SHOW = 8;

    private final NamedParameterJdbcTemplate jdbc;
    private final RecommendationOrderService orders;

    public ComprasAgent(NamedParameterJdbcTemplate jdbc, RecommendationOrderService orders) {
        this.jdbc = jdbc;
        this.orders = orders;
    }

    @Override
    public String name() {
        return "COMPRAS";
    }

    @Override
    public List<AgentSignal> signals(UUID marketId) {
        List<Map<String, Object>> recs = jdbc.queryForList(
            "select id, title, parameters->>'quantidade' as qtd, parameters->>'valorEstimado' as valor, expected_impact_value "
                + "from recommendations where market_id = :m and status = 'PROPOSTA' and action_type = 'COMPRAR' and exists (select 1 from opportunities op where op.id = recommendations.opportunity_id and op.status in ('NOVA', 'VISTA', 'EM_ACAO')) "
                + "order by expected_impact_value desc nulls last, id limit 40", Map.of("m", marketId));
        if (recs.isEmpty()) {
            return List.of();
        }
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal impact = BigDecimal.ZERO;
        StringBuilder body = new StringBuilder();
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < recs.size(); i++) {
            Map<String, Object> r = recs.get(i);
            ids.add(String.valueOf(r.get("id")));
            total = total.add(decimal(r.get("valor")));
            impact = impact.add(decimal(r.get("expected_impact_value")));
            if (i < SHOW) {
                body.append(i == 0 ? "" : "\n").append("• ").append(r.get("title"));
                if (r.get("qtd") != null) {
                    body.append(": comprar ").append(integer(decimal(r.get("qtd")))).append(" un.");
                }
            }
        }
        if (recs.size() > SHOW) {
            body.append("\n• e mais ").append(recs.size() - SHOW).append(recs.size() - SHOW == 1 ? " produto" : " produtos");
        }
        if (total.signum() > 0) {
            body.append("\nValor estimado do pedido: ").append(money(total)).append('.');
        }
        body.append("\nAo aprovar, os itens vão para o rascunho de pedido de cada fornecedor. Nada é enviado sem você revisar.");
        Map<String, Object> numbers = new LinkedHashMap<>();
        numbers.put("produtos", recs.size());
        numbers.put("valorEstimado", total);
        numbers.put("vendaProtegida", impact);
        // Mesmo conjunto de produtos e quantidades = mesmo sinal (não repete o aviso).
        String key = recs.stream().map(r -> r.get("id") + ":" + r.get("qtd")).sorted().collect(Collectors.joining(","));
        String title = recs.size() == 1 ? "Pedido sugerido: 1 produto para repor" : "Pedido sugerido: " + recs.size() + " produtos para repor";
        return List.of(new AgentSignal(name(), "PEDIDO", "compras", title, body.toString(), numbers,
            Map.of("recommendationIds", ids), impact.signum() > 0 ? impact : total, true, key));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> execute(UUID marketId, Map<String, Object> payload, String actor) {
        List<String> ids = (List<String>) payload.getOrDefault("recommendationIds", List.of());
        int linked = 0;
        int needsSupplier = 0;
        int notLinked = 0;
        int skipped = 0;
        for (String id : ids) {
            try {
                RecommendationOrderService.DecisionResult r = orders.decide(marketId, UUID.fromString(id),
                    Recommendation.Status.ACEITA, actor, "Aprovado no Copiloto (agente de Compras)", null);
                if (r.orderLink() == null) {
                    // Aceita, mas sem produto ou quantidade para o pedido: o comprador inclui à mão.
                    notLinked++;
                } else if (r.orderLink().status() == RecommendationOrderService.LinkStatus.NEEDS_SUPPLIER) {
                    needsSupplier++;
                } else {
                    linked++;
                }
            } catch (RuntimeException e) {
                // Já decidida na Central ou expirada: segue com as outras.
                log.debug("Recomendação {} não entrou no pedido: {}", id, e.getMessage());
                skipped++;
            }
        }
        return Map.of("noPedido", linked, "semFornecedor", needsSupplier, "foraDoPedido", notLinked, "jaDecididas", skipped);
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

    static BigDecimal decimal(Object v) {
        if (v == null) {
            return BigDecimal.ZERO;
        }
        try {
            return v instanceof BigDecimal b ? b : new BigDecimal(String.valueOf(v));
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    static String money(BigDecimal v) {
        return NumberFormat.getCurrencyInstance(BR).format(v).replace(' ', ' ');
    }

    static String integer(BigDecimal v) {
        return NumberFormat.getIntegerInstance(BR).format(v);
    }
}
