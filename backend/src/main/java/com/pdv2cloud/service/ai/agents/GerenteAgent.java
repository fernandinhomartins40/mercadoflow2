package com.pdv2cloud.service.ai.agents;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Agente Gerente: avisa do assunto novo de maior prioridade que o motor
 * detectou (oportunidade nova e de alto impacto). Só informa ou sugere:
 * a ação de cada assunto fica na Central de Inteligência.
 */
@Component
public class GerenteAgent implements CopilotAgent {

    /** Prioridade calculada pelo motor (0 a 100) a partir da qual vale avisar fora do resumo do dia. */
    static final int MIN_PRIORITY = 70;

    private final NamedParameterJdbcTemplate jdbc;

    public GerenteAgent(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String name() {
        return "GERENTE";
    }

    @Override
    public List<AgentSignal> signals(UUID marketId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select id, type, title, description, expected_impact_value, priority_score from opportunities "
                + "where market_id = :m and status = 'NOVA' and priority_score >= :p "
                + "and first_detected_at >= now() - interval '2 days' order by priority_score desc limit 5",
            Map.of("m", marketId, "p", MIN_PRIORITY));
        List<AgentSignal> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            BigDecimal impact = r.get("expected_impact_value") == null ? null : new BigDecimal(String.valueOf(r.get("expected_impact_value")));
            StringBuilder body = new StringBuilder(String.valueOf(r.get("description")));
            body.append("\nVeja e decida na Central de Inteligência.");
            Map<String, Object> numbers = new LinkedHashMap<>();
            numbers.put("prioridade", r.get("priority_score"));
            numbers.put("impacto", impact);
            // Impacto em faixas: a mesma oportunidade com número parecido não gera aviso novo.
            String band = impact == null ? "-" : impact.round(new java.math.MathContext(2, RoundingMode.HALF_UP)).toPlainString();
            out.add(new AgentSignal(name(), "AVISO", String.valueOf(r.get("type")), String.valueOf(r.get("title")),
                body.toString(), numbers, Map.of("opportunityId", String.valueOf(r.get("id"))), impact, false,
                r.get("id") + "|" + band));
        }
        return out;
    }
}
