package com.pdv2cloud.service.ai.agents;

import com.pdv2cloud.service.opportunity.RecommendationOrderService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** Agente de Capital parado: junta as liquidações sugeridas (estoque que demora a girar). */
@Component
public class CapitalAgent extends RecommendationBundleAgent {

    public CapitalAgent(NamedParameterJdbcTemplate jdbc, RecommendationOrderService orders) {
        super(jdbc, orders);
    }

    @Override
    public String name() {
        return "CAPITAL";
    }

    @Override
    List<String> actionTypes() {
        return List.of("LIQUIDAR");
    }

    @Override
    String kind() {
        return "LIQUIDACAO";
    }

    @Override
    String title(int count, BigDecimal impact) {
        return count == 1 ? "Dinheiro parado: 1 produto para liquidar" : "Dinheiro parado: " + count + " produtos para liquidar";
    }

    @Override
    String line(Map<String, Object> r) {
        StringBuilder sb = new StringBuilder(String.valueOf(r.get("title")));
        if (r.get("estoque") != null) {
            sb.append(": ").append(ComprasAgent.money(ComprasAgent.decimal(r.get("estoque")))).append(" parados");
        }
        // Cobertura zero aqui quer dizer "sem venda para medir", não "sem estoque": liquidar o que não tem estoque não faria sentido.
        BigDecimal cover = r.get("cobertura") == null ? null : ComprasAgent.decimal(r.get("cobertura"));
        if (cover != null && cover.signum() > 0) {
            sb.append(", ").append(ComprasAgent.integer(cover)).append(" dias de estoque");
        } else if (cover != null) {
            sb.append(", sem venda no período");
        }
        return sb.toString();
    }

    @Override
    String closing() {
        return "Ao aprovar, o Copiloto registra a liquidação e mede em 30 dias se o dinheiro voltou. O preço você muda no caixa.";
    }
}
