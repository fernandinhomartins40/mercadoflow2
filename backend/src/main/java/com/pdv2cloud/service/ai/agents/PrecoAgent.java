package com.pdv2cloud.service.ai.agents;

import com.pdv2cloud.service.opportunity.RecommendationOrderService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** Agente de Preço: preço acima da referência de mercado, para conferir e ajustar. */
@Component
public class PrecoAgent extends RecommendationBundleAgent {

    public PrecoAgent(NamedParameterJdbcTemplate jdbc, RecommendationOrderService orders) {
        super(jdbc, orders);
    }

    @Override
    public String name() {
        return "PRECO";
    }

    @Override
    List<String> actionTypes() {
        return List.of("AJUSTAR_PRECO");
    }

    @Override
    String kind() {
        return "AJUSTE_PRECO";
    }

    @Override
    String title(int count, BigDecimal impact) {
        return count == 1 ? "Preço para revisar: 1 produto acima do mercado" : "Preço para revisar: " + count + " produtos acima do mercado";
    }

    @Override
    String line(Map<String, Object> r) {
        StringBuilder sb = new StringBuilder(String.valueOf(r.get("title")));
        if (r.get("preco") != null && r.get("referencia") != null) {
            sb.append(": você cobra ").append(ComprasAgent.money(ComprasAgent.decimal(r.get("preco"))))
                .append(", o mercado ").append(ComprasAgent.money(ComprasAgent.decimal(r.get("referencia"))));
        }
        return sb.toString();
    }

    @Override
    String closing() {
        return "A referência pode ser de outra região: confira antes. Ao aprovar, o Copiloto registra o ajuste e mede o resultado; o preço você muda no caixa.";
    }
}
