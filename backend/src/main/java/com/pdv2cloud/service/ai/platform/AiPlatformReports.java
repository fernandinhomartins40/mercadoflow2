package com.pdv2cloud.service.ai.platform;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.service.ai.AiOrchestrator;
import com.pdv2cloud.service.ai.OpportunityInterpreter;
import com.pdv2cloud.service.ai.chat.DataChatService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Relatório de uso e console de teste do painel "IA e APIs".
 *
 * Relatório: gasto por dia, provedor, tarefa e mercado; créditos usados;
 * receita de pacotes; e a concordância do Jev em modo sombra — é o que decide
 * quando o Jev passa a valer de verdade.
 *
 * Console: roda uma tarefa real contra um mercado, sem debitar créditos, e
 * mostra qual camada respondeu, tokens, custo e tempo.
 */
@Service
public class AiPlatformReports {

    private final NamedParameterJdbcTemplate jdbc;
    private final AiPlatformConfig config;
    private final AiGate gate;
    private final JevClient jev;
    private final DataChatService chat;
    private final OpportunityInterpreter interpreter;
    private final OpportunityRepository opportunities;

    public AiPlatformReports(NamedParameterJdbcTemplate jdbc, AiPlatformConfig config, AiGate gate, JevClient jev,
                             DataChatService chat, OpportunityInterpreter interpreter, OpportunityRepository opportunities) {
        this.jdbc = jdbc;
        this.config = config;
        this.gate = gate;
        this.jev = jev;
        this.chat = chat;
        this.interpreter = interpreter;
        this.opportunities = opportunities;
    }

    // ── Relatório ──────────────────────────────────────────────────────────

    public Map<String, Object> usage(int days) {
        int d = Math.max(1, Math.min(days, 365));
        MapSqlParameterSource p = new MapSqlParameterSource("d", d);
        double fx = config.settings().usdBrl().doubleValue();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("dias", d);
        out.put("cambio", fx);
        out.put("gastoHojeUsd", gate.spentTodayUsd());
        out.put("tetoDiarioUsd", config.settings().dailyBudgetUsd());
        out.put("totais", jdbc.queryForMap(
            "select count(*) filter (where platform) as chamadas, coalesce(sum(cost_usd) filter (where platform), 0) as custo_usd, "
                + "coalesce(sum(input_tokens) filter (where platform), 0) as tokens_entrada, "
                + "coalesce(sum(output_tokens) filter (where platform), 0) as tokens_saida, "
                + "coalesce(sum(credits) filter (where platform), 0) as creditos, "
                + "count(*) filter (where platform and outcome = 'ERRO') as erros "
                + "from ai_usage_log where created_at >= current_date - :d", p));
        out.put("receitaCentavos", jdbc.queryForObject(
            "select coalesce(sum(amount_cents), 0) from ai_orders where status = 'PAID' and paid_at >= current_date - :d", p, Long.class));
        out.put("porDia", jdbc.queryForList(
            "select created_at::date as dia, count(*) as chamadas, coalesce(sum(cost_usd), 0) as custo_usd, coalesce(sum(credits), 0) as creditos "
                + "from ai_usage_log where platform and created_at >= current_date - :d group by 1 order by 1", p));
        out.put("porTarefa", jdbc.queryForList(
            "select task as tarefa, coalesce(layer, '-') as camada, count(*) as chamadas, coalesce(sum(input_tokens), 0) as tokens_entrada, "
                + "coalesce(sum(output_tokens), 0) as tokens_saida, coalesce(sum(cost_usd), 0) as custo_usd, coalesce(sum(credits), 0) as creditos, "
                + "round(avg(latency_ms)) as tempo_medio_ms from ai_usage_log where platform and created_at >= current_date - :d "
                + "group by 1, 2 order by custo_usd desc", p));
        out.put("porProvedor", jdbc.queryForList(
            "select coalesce(provider, '-') as provedor, count(*) as chamadas, coalesce(sum(cost_usd), 0) as custo_usd "
                + "from ai_usage_log where platform and created_at >= current_date - :d group by 1 order by custo_usd desc", p));
        out.put("porMercado", jdbc.queryForList(
            "select m.name as mercado, count(*) as chamadas, coalesce(sum(l.cost_usd), 0) as custo_usd, coalesce(sum(l.credits), 0) as creditos "
                + "from ai_usage_log l join markets m on m.id = l.market_id where l.platform and l.created_at >= current_date - :d "
                + "group by m.name order by custo_usd desc limit 20", p));
        out.put("sombra", jdbc.queryForList(
            "select s.task as tarefa, count(*) as amostras, round(100.0 * avg(case when s.agreed then 1 else 0 end), 1) as concordancia, "
                + "round(100.0 * avg(case when s.agreed then 1 else 0 end) filter (where s.jev_confidence >= r.jev_threshold), 1) as concordancia_confiante, "
                + "count(*) filter (where s.jev_confidence >= r.jev_threshold) as amostras_confiantes, "
                + "round(avg(s.jev_confidence) * 100, 1) as confianca_media, round(avg(s.latency_ms)) as tempo_medio_ms "
                + "from ai_shadow_decisions s join ai_task_routes r on r.task = s.task "
                + "where s.created_at >= current_date - :d group by s.task order by s.task", p));
        out.put("sombraRecente", jdbc.queryForList(
            "select s.task as tarefa, s.jev_answer as jev, s.reference_answer as referencia, s.agreed as concordou, "
                + "s.jev_confidence as confianca, s.created_at as quando from ai_shadow_decisions s order by s.created_at desc limit 20", Map.of()));
        return out;
    }

    // ── Console ────────────────────────────────────────────────────────────

    public Map<String, Object> console(UUID marketId, String task, String input, UUID opportunityId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tarefa", task);
        long started = System.currentTimeMillis();
        double fx = config.settings().usdBrl().doubleValue();
        switch (task) {
            case "CHAT" -> {
                AiGate.Decision d = gate.decide(marketId, DataChatService.TASK);
                out.put("portao", d.reason().name());
                DataChatService.ChatAnswer a = AiGate.withoutCharge(() -> chat.ask(marketId, input, null));
                out.put("sucesso", a.success());
                out.put("resposta", a.success() ? a.answer() : a.errorMessage());
                out.put("camada", a.platform() ? a.layer() : a.provider() == null ? "-" : "CHAVE PRÓPRIA");
                out.put("provedor", a.provider());
                out.put("consultas", a.toolsUsed());
                out.put("tokensEntrada", a.inputTokens());
                out.put("tokensSaida", a.outputTokens());
                out.put("custoUsd", a.costUsd());
                out.put("custoBrl", a.costUsd() * fx);
            }
            case "EXPLAIN" -> {
                Opportunity o = opportunityId != null
                    ? opportunities.findByIdAndMarketId(opportunityId, marketId).orElse(null)
                    : opportunities.findOpenByMarket(marketId).stream().findFirst().orElse(null);
                if (o == null) {
                    throw new IllegalArgumentException("Esse mercado não tem oportunidade aberta para explicar");
                }
                AiGate.Decision d = gate.decide(marketId, OpportunityInterpreter.TASK);
                out.put("portao", d.reason().name());
                out.put("oportunidade", o.getTitle());
                AiOrchestrator.Interpretation r = AiGate.withoutCharge(() -> interpreter.explainOnDemand(marketId, o));
                out.put("sucesso", true);
                out.put("resposta", r.content());
                out.put("camada", r.fromCache() ? "CACHE" : r.deterministic() ? "TEXTO PRONTO" : d.allowed() ? d.route().layer() : "CHAVE PRÓPRIA");
                out.put("provedor", r.provider());
                Map<String, Object> last = lastUsage(marketId, OpportunityInterpreter.TASK);
                out.putAll(last);
                Object cost = last.get("custoUsd");
                out.put("custoBrl", cost == null ? 0 : ((Number) cost).doubleValue() * fx);
            }
            case "JEV" -> {
                AiPlatformConfig.Key key = config.key("JEV")
                    .orElseThrow(() -> new IllegalArgumentException("Cadastre e ligue a chave do Jev"));
                Map<String, String> options = new LinkedHashMap<>();
                options.put("vendas", "faturamento, vendas, cupons, ticket, horário de movimento");
                options.put("comprar", "o que comprar, reposição, estoque acabando");
                options.put("capital_parado", "estoque parado, produto sem giro");
                options.put("oportunidades", "recomendações e oportunidades do sistema");
                options.put("produto", "um produto específico");
                options.put("nenhuma", "cumprimento ou pergunta sobre o assistente");
                JevClient.Result r = jev.decide(key.baseUrl(), key.apiKey(), key.defaultModel(), input,
                    Map.of("assunto", JevClient.Question.choice("Sobre o que é a pergunta do lojista?", options),
                        "urgente", JevClient.Question.yesNo("O lojista precisa de resposta urgente?")));
                out.put("portao", "OK");
                out.put("sucesso", r.success());
                out.put("resposta", r.success() ? r.answers() : r.error());
                out.put("camada", "JEV");
                out.put("provedor", "JEV");
                out.put("tokensEntrada", r.inputTokens());
                out.put("tokensSaida", 0);
                double cost = r.inputTokens() == null ? 0 : r.inputTokens() * 0.042 / 1_000_000d;
                out.put("custoUsd", cost);
                out.put("custoBrl", cost * fx);
            }
            default -> throw new IllegalArgumentException("Tarefa de console desconhecida");
        }
        out.put("tempoMs", System.currentTimeMillis() - started);
        return out;
    }

    private Map<String, Object> lastUsage(UUID marketId, String task) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select input_tokens, output_tokens, cost_usd, layer from ai_usage_log where market_id = :m and task = :t "
                + "and created_at >= now() - interval '2 minutes' order by created_at desc limit 1", Map.of("m", marketId, "t", task));
        Map<String, Object> out = new LinkedHashMap<>();
        if (!rows.isEmpty()) {
            out.put("tokensEntrada", rows.get(0).get("input_tokens"));
            out.put("tokensSaida", rows.get(0).get("output_tokens"));
            out.put("custoUsd", rows.get(0).get("cost_usd") == null ? 0 : ((Number) rows.get(0).get("cost_usd")).doubleValue());
        }
        return out;
    }
}
