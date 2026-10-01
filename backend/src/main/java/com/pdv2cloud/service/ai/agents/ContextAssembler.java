package com.pdv2cloud.service.ai.agents;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.service.ai.AiUsageRecorder;
import com.pdv2cloud.service.ai.platform.AiGate;
import com.pdv2cloud.service.ai.platform.JevClient;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Montador de contexto (proposta, seção 6.6): a IA recebe só os pedaços de
 * memória que importam para a tarefa. O código filtra, o Jev dá a nota de
 * relevância numa chamada só, e entra do mais relevante ao menos até o teto
 * de tokens. Sem Jev, a regra: mesmo assunto primeiro, depois o mais recente.
 * Cada montagem fica registrada para auditar por que a IA decidiu daquele jeito.
 */
@Service
public class ContextAssembler {

    static final String TASK = "JEV_RELEVANCIA";
    /** Abaixo disso nem vale chamar o Jev: tudo cabe. */
    static final int MIN_FOR_JEV = 4;

    private final AiGate gate;
    private final JevClient jev;
    private final AiUsageRecorder usage;
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper mapper = new ObjectMapper();

    public ContextAssembler(AiGate gate, JevClient jev, AiUsageRecorder usage, NamedParameterJdbcTemplate jdbc) {
        this.gate = gate;
        this.jev = jev;
        this.usage = usage;
        this.jdbc = jdbc;
    }

    public record Piece(String id, String text, boolean sameSubject, java.time.LocalDateTime updatedAt) {}

    public record Selection(List<Piece> pieces, String selector) {}

    public Selection select(UUID marketId, String task, UUID refId, String goal, List<Piece> candidates, int maxTokens) {
        List<Piece> ranked;
        String selector;
        Map<String, Integer> scores = candidates.size() >= MIN_FOR_JEV ? jevScores(marketId, goal, candidates) : null;
        Comparator<Piece> rule = Comparator.comparing(Piece::sameSubject).reversed()
            .thenComparing(Piece::updatedAt, Comparator.reverseOrder());
        if (scores != null) {
            selector = "JEV";
            ranked = candidates.stream().filter(p -> scores.getOrDefault(p.id(), 0) > 0)
                .sorted(Comparator.<Piece>comparingInt(p -> scores.getOrDefault(p.id(), 0)).reversed().thenComparing(rule))
                .toList();
        } else {
            selector = "REGRA";
            ranked = candidates.stream().sorted(rule).toList();
        }
        List<Piece> chosen = new ArrayList<>();
        int used = 0;
        for (Piece p : ranked) {
            int tokens = p.text().length() / 4 + 1;
            if (used + tokens > maxTokens) {
                break;
            }
            chosen.add(p);
            used += tokens;
        }
        jdbc.update("insert into ai_context_traces (market_id, task, ref_id, candidates, pieces, selector) "
                + "values (:m, :t, :r, :c, cast(:p as jsonb), :s)",
            new MapSqlParameterSource().addValue("m", marketId).addValue("t", task).addValue("r", refId)
                .addValue("c", candidates.size()).addValue("p", json(chosen.stream().map(Piece::id).toList())).addValue("s", selector));
        return new Selection(chosen, selector);
    }

    /** Nota de 0 a 2 para cada pedaço, numa chamada só; null quando o Jev não está disponível. */
    private Map<String, Integer> jevScores(UUID marketId, String goal, List<Piece> candidates) {
        AiGate.Decision d;
        try {
            d = gate.decide(marketId, TASK);
        } catch (RuntimeException e) {
            return null;
        }
        if (!d.allowed() || d.route().shadow()) {
            return null;
        }
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("tarefa", goal);
        Map<String, String> pieces = new LinkedHashMap<>();
        Map<String, JevClient.Question> q = new LinkedHashMap<>();
        Map<String, String> levels = Map.of("0", "não ajuda", "1", "ajuda um pouco", "2", "ajuda muito");
        for (int i = 0; i < candidates.size() && i < 40; i++) {
            pieces.put("p" + i, candidates.get(i).text());
            q.put("p" + i, JevClient.Question.score("O pedaço p" + i + " ajuda a cumprir a tarefa?", levels));
        }
        state.put("pedacos", pieces);
        JevClient.Result r = jev.decide(d.key().baseUrl(), d.key().apiKey(), d.model(), state, q);
        usage.recordFull(marketId, TASK, "JEV", d.model(), "contexto-v1", null, r.inputTokens(), 0, (int) r.latencyMs(),
            r.success() ? AiUsageLog.Outcome.OK : AiUsageLog.Outcome.ERRO, r.error(), AiGate.costUsd(d.route(), r.inputTokens(), 0),
            "JEV", 0, true);
        if (!r.success()) {
            return null;
        }
        Map<String, Integer> out = new LinkedHashMap<>();
        for (int i = 0; i < candidates.size() && i < 40; i++) {
            JevClient.Answer a = r.answers().get("p" + i);
            int score = 1;
            if (a != null) {
                try {
                    score = Integer.parseInt(a.answer());
                } catch (NumberFormatException e) {
                    score = 1;
                }
            }
            out.put(candidates.get(i).id(), score);
        }
        return out;
    }

    private String json(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (Exception e) {
            return "[]";
        }
    }
}
