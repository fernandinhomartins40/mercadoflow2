package com.pdv2cloud.service.ai.agents;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.service.ai.AiUsageRecorder;
import com.pdv2cloud.service.ai.LlmClient;
import com.pdv2cloud.service.ai.platform.AiGate;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Caixa de decisões do Copiloto: o que os agentes prepararam, esperando o sim
 * do lojista. Aprovar executa a ação só no nível 2 (preparar) e sempre por um
 * caminho que o lojista ainda revisa (rascunho de pedido, WhatsApp aberto com a
 * mensagem). Recusar vira lição. O "Por quê?" é o único ponto que chama o
 * DeepSeek, sob demanda e com o contexto montado pelo {@link ContextAssembler}.
 */
@Service
public class DecisionService {

    public static final String EXPLAIN_TASK = "AGENTE_EXPLICAR";
    static final String SYSTEM = "Você é o Copiloto de um supermercado brasileiro. Explique em português simples, em até "
        + "5 frases, por que o agente preparou esta decisão e o que o dono ganha ou arrisca. Use só os números e as lições "
        + "fornecidos; não invente valores, datas nem nomes. Sem saudação e sem listas longas.";

    private final NamedParameterJdbcTemplate jdbc;
    private final Map<String, CopilotAgent> agents;
    private final LessonService lessons;
    private final ContextAssembler context;
    private final AiGate gate;
    private final LlmClient llm;
    private final AiUsageRecorder usage;
    private final ObjectMapper mapper = new ObjectMapper();

    public DecisionService(NamedParameterJdbcTemplate jdbc, List<CopilotAgent> agents, LessonService lessons,
                           ContextAssembler context, AiGate gate, LlmClient llm, AiUsageRecorder usage) {
        this.jdbc = jdbc;
        this.agents = agents.stream().collect(Collectors.toMap(CopilotAgent::name, Function.identity()));
        this.lessons = lessons;
        this.context = context;
        this.gate = gate;
        this.llm = llm;
        this.usage = usage;
    }

    public record Decision(UUID id, String agent, String kind, String scopeKey, String title, String body,
                           Map<String, Object> numbers, Map<String, Object> payload, BigDecimal impact, int level,
                           boolean urgent, String status, Map<String, Object> funnel, String explanation,
                           LocalDateTime createdAt, LocalDateTime decidedAt, String decidedBy, String decisionNote,
                           Map<String, Object> result) {}

    public record Explanation(String texto, boolean ia, boolean doCache, String aviso) {}

    private static final String COLS = "id, agent, kind, scope_key, title, body, numbers::text as numbers, payload::text as payload, "
        + "impact, level, urgent, status, funnel::text as funnel, explanation, created_at, decided_at, decided_by, decision_note, "
        + "result::text as result";

    /** Caixa: pendentes e avisos primeiro (urgentes no topo); "decididas" e "silenciadas" sob pedido. */
    public List<Decision> inbox(UUID marketId, String view) {
        String where = switch (view == null ? "" : view) {
            case "decididas" -> "status in ('APROVADA', 'RECUSADA', 'EXPIRADA')";
            case "silenciadas" -> "status = 'SILENCIADA'";
            default -> "status in ('PENDENTE', 'INFORMATIVA')";
        };
        String order = "decididas".equals(view) ? "coalesce(decided_at, created_at) desc" : "urgent desc, created_at desc";
        return jdbc.query("select " + COLS + " from ai_decisions where market_id = :m and " + where + " order by " + order + " limit 60",
            Map.of("m", marketId), (rs, i) -> map(rs));
    }

    public Map<String, Object> counts(UUID marketId) {
        return jdbc.queryForMap("select count(*) filter (where status = 'PENDENTE') as pendentes, "
            + "count(*) filter (where status = 'INFORMATIVA') as avisos, "
            + "count(*) filter (where status in ('PENDENTE', 'INFORMATIVA') and urgent) as urgentes "
            + "from ai_decisions where market_id = :m", Map.of("m", marketId));
    }

    public Decision get(UUID marketId, UUID id) {
        List<Decision> r = jdbc.query("select " + COLS + " from ai_decisions where market_id = :m and id = :id",
            Map.of("m", marketId, "id", id), (rs, i) -> map(rs));
        if (r.isEmpty()) {
            throw new java.util.NoSuchElementException("Decisão não encontrada");
        }
        return r.get(0);
    }

    /**
     * Aprovar. Sem transação em volta: a ação (ex.: cada item do pedido) roda
     * nas transações próprias dela, e uma recomendação já decidida na Central
     * não derruba as outras.
     */
    public Decision approve(UUID marketId, UUID id, String actor) {
        Decision d = get(marketId, id);
        if (!"PENDENTE".equals(d.status())) {
            throw new IllegalStateException("Esta decisão não está mais esperando resposta.");
        }
        // Marca primeiro (condicional): dois toques seguidos não executam a ação duas vezes.
        int claimed = jdbc.update("update ai_decisions set status = 'APROVADA', decided_at = now(), decided_by = :u "
            + "where market_id = :m and id = :id and status = 'PENDENTE'", Map.of("m", marketId, "id", id, "u", actor));
        if (claimed == 0) {
            throw new IllegalStateException("Esta decisão já foi respondida.");
        }
        Map<String, Object> result = Map.of("executado", false);
        CopilotAgent agent = agents.get(d.agent());
        if (d.level() >= 2 && agent != null) {
            result = new java.util.LinkedHashMap<>(agent.execute(marketId, d.payload(), actor));
            result.put("executado", true);
        }
        jdbc.update("update ai_decisions set result = cast(:r as jsonb) where market_id = :m and id = :id",
            new MapSqlParameterSource().addValue("m", marketId).addValue("id", id).addValue("r", json(result)));
        return get(marketId, id);
    }

    public Decision refuse(UUID marketId, UUID id, String reason, String actor) {
        Decision d = get(marketId, id);
        if (!"PENDENTE".equals(d.status()) && !"INFORMATIVA".equals(d.status())) {
            throw new IllegalStateException("Esta decisão não está mais esperando resposta.");
        }
        String note = reason == null || reason.isBlank() ? null : reason.trim().length() > 300 ? reason.trim().substring(0, 300) : reason.trim();
        jdbc.update("update ai_decisions set status = 'RECUSADA', decided_at = now(), decided_by = :u, decision_note = :n "
            + "where market_id = :m and id = :id", new MapSqlParameterSource().addValue("m", marketId).addValue("id", id)
            .addValue("u", actor).addValue("n", note));
        lessons.fromRefusal(marketId, d.agent(), d.kind(), d.scopeKey(), d.title(), note);
        return get(marketId, id);
    }

    /** "Por quê?": o único andar que usa o DeepSeek; resposta guardada (o segundo toque não cobra). */
    public Explanation explain(UUID marketId, UUID id) {
        Decision d = get(marketId, id);
        if (d.explanation() != null) {
            return new Explanation(d.explanation(), true, true, null);
        }
        String fallback = d.body();
        AiGate.Decision g = gate.decide(marketId, EXPLAIN_TASK);
        if (!g.allowed()) {
            return new Explanation(fallback, false, false, g.reason() == AiGate.Reason.TEMPLATE ? null : g.message());
        }
        // Memória: lições do mesmo assunto e do agente, escolhidas para esta decisão.
        List<ContextAssembler.Piece> candidates = new ArrayList<>();
        for (LessonService.Lesson l : lessons.all(marketId)) {
            boolean same = l.scopeKey().equals(d.scopeKey()) || l.scopeKey().startsWith(d.agent() + ":");
            candidates.add(new ContextAssembler.Piece(l.id().toString(), l.text(), same, l.updatedAt()));
        }
        ContextAssembler.Selection sel = context.select(marketId, EXPLAIN_TASK, id, "Explicar ao dono por que vale: " + d.title(),
            candidates, Math.max(200, g.route().maxContextTokens() / 3));
        StringBuilder user = new StringBuilder("Decisão preparada pelo agente ").append(d.agent()).append(": ").append(d.title())
            .append("\n\nDetalhe:\n").append(d.body()).append("\n\nNúmeros do sistema: ").append(json(d.numbers()));
        if (!sel.pieces().isEmpty()) {
            user.append("\n\nO que a loja já aprendeu:");
            sel.pieces().forEach(p -> user.append("\n- ").append(p.text()));
        }
        // Modelo da rota e, se falhar, as reservas configuradas no painel.
        List<AiGate.Decision> chain = gate.attempts(g);
        LlmClient.LlmResponse r = null;
        AiGate.Decision served = null;
        for (AiGate.Decision attempt : chain == null || chain.isEmpty() ? List.of(g) : chain) {
            r = llm.chat(attempt.key().baseUrl(), attempt.key().apiKey(), attempt.model(), SYSTEM, user.toString(),
                attempt.route().maxOutputTokens(), attempt.route().temperature());
            double cost = AiGate.costUsd(attempt.route(), r.inputTokens(), r.outputTokens());
            if (r.success() && r.content() != null && !r.content().isBlank()) {
                int credits = gate.charge(marketId, attempt.route(), "decisao:" + id);
                usage.recordFull(marketId, EXPLAIN_TASK, attempt.route().provider(), attempt.model(), "agentes-v1", null,
                    r.inputTokens(), r.outputTokens(), (int) r.latencyMs(), AiUsageLog.Outcome.OK, null, cost,
                    attempt.route().layer(), credits, true);
                served = attempt;
                break;
            }
            usage.recordFull(marketId, EXPLAIN_TASK, attempt.route().provider(), attempt.model(), "agentes-v1", null,
                r.inputTokens(), r.outputTokens(), (int) r.latencyMs(), AiUsageLog.Outcome.ERRO, r.errorMessage(), cost,
                attempt.route().layer(), 0, true);
        }
        if (served == null) {
            return new Explanation(fallback, false, false, "A IA não respondeu agora. Este é o texto do sistema.");
        }
        String text = r.content().trim();
        jdbc.update("update ai_decisions set explanation = :e where market_id = :m and id = :id",
            Map.of("m", marketId, "id", id, "e", text));
        return new Explanation(text, true, false, null);
    }

    private Decision map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Decision((UUID) rs.getObject("id"), rs.getString("agent"), rs.getString("kind"), rs.getString("scope_key"),
            rs.getString("title"), rs.getString("body"), read(rs.getString("numbers")), read(rs.getString("payload")),
            rs.getBigDecimal("impact"), rs.getInt("level"), rs.getBoolean("urgent"), rs.getString("status"),
            read(rs.getString("funnel")), rs.getString("explanation"), ts(rs.getTimestamp("created_at")),
            ts(rs.getTimestamp("decided_at")), rs.getString("decided_by"), rs.getString("decision_note"), read(rs.getString("result")));
    }

    private static LocalDateTime ts(java.sql.Timestamp t) {
        return t == null ? null : t.toLocalDateTime();
    }

    private Map<String, Object> read(String json) {
        try {
            return json == null ? null : mapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String json(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (Exception e) {
            return "{}";
        }
    }
}
