package com.pdv2cloud.service.ai.agents;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.service.ai.AiUsageRecorder;
import com.pdv2cloud.service.ai.platform.AiGate;
import com.pdv2cloud.service.ai.platform.JevClient;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Vigília dos agentes em funil (proposta, seção 6.5). Nenhum agente fica
 * "ligado" chamando IA: a cada rodada,
 * <ol>
 *   <li>o motor entrega os sinais com texto pronto (sem token);</li>
 *   <li>a memória descarta o que já foi avisado, o que o lojista recusou há
 *       pouco, o que está abaixo do valor mínimo e o que passa do limite do dia
 *       (sem token);</li>
 *   <li>o Jev julga, numa chamada só, se o sinal merece avisar e se é urgente
 *       (frações de centavo). Sem Jev, vale a regra e nada quebra;</li>
 *   <li>o DeepSeek só entra quando o lojista toca em "Por quê?".</li>
 * </ol>
 */
@Service
public class AgentRunner {

    private static final Logger log = LoggerFactory.getLogger(AgentRunner.class);
    static final String JEV_TASK = "JEV_VIGILIA";
    /** Dias em que uma recusa segura propostas iguais do mesmo agente. */
    static final int REFUSAL_DAYS = 14;
    static final int EXPIRE_DAYS = 7;
    static final BigDecimal URGENT_IMPACT = BigDecimal.valueOf(500);

    private final List<CopilotAgent> agents;
    private final CopilotSettingsService settings;
    private final LessonService lessons;
    private final AiGate gate;
    private final JevClient jev;
    private final AiUsageRecorder usage;
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper mapper = new ObjectMapper();
    private AutonomyGuard autonomy;
    private DecisionService decisions;

    public AgentRunner(List<CopilotAgent> agents, CopilotSettingsService settings, LessonService lessons, AiGate gate,
                       JevClient jev, AiUsageRecorder usage, NamedParameterJdbcTemplate jdbc) {
        this.agents = agents;
        this.settings = settings;
        this.lessons = lessons;
        this.gate = gate;
        this.jev = jev;
        this.usage = usage;
        this.jdbc = jdbc;
    }

    /** Nível 3 (opcional: sem ele, tudo fica no máximo no nível 2). */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setAutonomy(AutonomyGuard autonomy, DecisionService decisions) {
        this.autonomy = autonomy;
        this.decisions = decisions;
    }

    public record RunResult(int signals, int afterMemory, int jevCalls, int created, int silenced, Map<String, Integer> dropped,
                            int autoExecuted) {}

    /** Veredito do andar 3. */
    record Verdict(boolean worth, boolean urgent, String source, Double worthProbability, Double confidence) {}

    public RunResult run(UUID marketId, String trigger) {
        jdbc.update("update ai_decisions set status = 'EXPIRADA' where market_id = :m and status = 'PENDENTE' "
            + "and created_at < now() - make_interval(days => :d)", Map.of("m", marketId, "d", EXPIRE_DAYS));
        int signals = 0;
        int afterMemory = 0;
        int jevCalls = 0;
        int created = 0;
        int silenced = 0;
        int auto = 0;
        Map<String, Integer> dropped = new LinkedHashMap<>();
        for (CopilotAgent agent : agents) {
            CopilotSettingsService.AgentSettings cfg = settings.agent(marketId, agent.name());
            if (!cfg.enabled()) {
                continue;
            }
            List<AgentSignal> found;
            try {
                found = agent.signals(marketId);
            } catch (RuntimeException e) {
                log.warn("Agente {} falhou no mercado {}: {}", agent.name(), marketId, e.getMessage());
                continue;
            }
            signals += found.size();
            int today = count("select count(*) from ai_decisions where market_id = :m and agent = :a and status <> 'SILENCIADA' "
                + "and created_at >= date_trunc('day', now())",
                new MapSqlParameterSource().addValue("m", marketId).addValue("a", agent.name()));
            for (AgentSignal s : found) {
                String drop = memory(marketId, s, cfg, today);
                if (drop != null) {
                    dropped.merge(drop, 1, Integer::sum);
                    continue;
                }
                afterMemory++;
                Verdict v = judge(marketId, s);
                if ("JEV".equals(v.source())) {
                    jevCalls++;
                }
                String status = !v.worth() ? "SILENCIADA"
                    : cfg.level() == 0 || !s.actionable() ? "INFORMATIVA" : "PENDENTE";
                UUID id = insert(marketId, s, cfg.level(), v, status);
                if (id != null) {
                    if ("SILENCIADA".equals(status)) {
                        silenced++;
                    } else {
                        created++;
                        today++;
                        if ("PENDENTE".equals(status) && cfg.level() == 3 && actAlone(marketId, id, s, cfg)) {
                            auto++;
                        }
                    }
                }
            }
        }
        RunResult result = new RunResult(signals, afterMemory, jevCalls, created, silenced, dropped, auto);
        jdbc.update("insert into ai_agent_runs (market_id, run_trigger, signals, after_memory, jev_calls, created, silenced, detail) "
                + "values (:m, :t, :s, :a, :j, :c, :x, cast(:d as jsonb))",
            new MapSqlParameterSource().addValue("m", marketId).addValue("t", trigger).addValue("s", signals)
                .addValue("a", afterMemory).addValue("j", jevCalls).addValue("c", created).addValue("x", silenced)
                .addValue("d", json(dropped)));
        return result;
    }

    /** Andar 2: motivo para não seguir, ou null. */
    String memory(UUID marketId, AgentSignal s, CopilotSettingsService.AgentSettings cfg, int today) {
        if (count("select count(*) from ai_decisions where market_id = :m and signal_hash = :h",
            new MapSqlParameterSource().addValue("m", marketId).addValue("h", s.hash())) > 0) {
            return "jaAvisado";
        }
        if (count("select count(*) from ai_decisions where market_id = :m and agent = :a and kind = :k and scope_key = :s "
            + "and status = 'RECUSADA' and decided_at >= now() - make_interval(days => :d)",
            new MapSqlParameterSource().addValue("m", marketId).addValue("a", s.agent()).addValue("k", s.kind())
                .addValue("s", s.scopeKey()).addValue("d", REFUSAL_DAYS)) > 0) {
            return "recusadoHaPouco";
        }
        if (s.impact() != null && cfg.minImpact().signum() > 0 && s.impact().compareTo(cfg.minImpact()) < 0) {
            return "abaixoDoMinimo";
        }
        if (today >= cfg.dailyLimit()) {
            return "limiteDoDia";
        }
        return null;
    }

    /** Andar 3: Jev em lote (vale avisar? é urgente?), com as lições do assunto; sem Jev, a regra. */
    Verdict judge(UUID marketId, AgentSignal s) {
        boolean ruleUrgent = "MENSAGEM_FORNECEDOR".equals(s.kind()) || s.impact() != null && s.impact().compareTo(URGENT_IMPACT) >= 0;
        AiGate.Decision d;
        try {
            d = gate.decide(marketId, JEV_TASK);
        } catch (RuntimeException e) {
            return new Verdict(true, ruleUrgent, "REGRA", null, null);
        }
        if (!d.allowed() || d.route().shadow()) {
            return new Verdict(true, ruleUrgent, "REGRA", null, null);
        }
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("agente", s.agent());
        state.put("assunto", s.title());
        state.put("detalhe", s.body().length() > 600 ? s.body().substring(0, 600) : s.body());
        state.put("numeros", s.numbers());
        List<String> memory = lessons.about(marketId, s.scopeKey()).stream().map(LessonService.Lesson::text).toList();
        if (!memory.isEmpty()) {
            state.put("licoes", memory);
        }
        Map<String, JevClient.Question> q = new LinkedHashMap<>();
        q.put("vale", JevClient.Question.yesNo("Isto merece avisar o dono do supermercado agora, em vez de esperar o resumo do dia?"));
        q.put("urgente", JevClient.Question.yesNo("Precisa de ação ainda hoje para não perder venda ou dinheiro?"));
        JevClient.Result r = jev.decide(d.key().baseUrl(), d.key().apiKey(), d.model(), state, q);
        usage.recordFull(marketId, JEV_TASK, "JEV", d.model(), "agentes-v1", null, r.inputTokens(), 0, (int) r.latencyMs(),
            r.success() ? AiUsageLog.Outcome.OK : AiUsageLog.Outcome.ERRO, r.error(), AiGate.costUsd(d.route(), r.inputTokens(), 0),
            "JEV", 0, true);
        JevClient.Answer worth = r.success() ? r.answers().get("vale") : null;
        JevClient.Answer urgent = r.success() ? r.answers().get("urgente") : null;
        if (worth == null) {
            return new Verdict(true, ruleUrgent, "REGRA", null, null);
        }
        // Só silencia com confiança: na dúvida, o lojista recebe (o produto nunca fica pior que sem o Jev).
        boolean confidentNo = "nao".equals(worth.answer()) && worth.confidence() >= d.route().jevThreshold();
        boolean isUrgent = urgent != null && "sim".equals(urgent.answer()) && urgent.confidence() >= d.route().jevThreshold() || ruleUrgent;
        return new Verdict(!confidentNo, isUrgent, "JEV", worth.probability(), worth.confidence());
    }

    /**
     * Nível 3: dentro dos limites, o próprio agente aprova (registrado como
     * "copiloto"). Fora deles, a decisão fica esperando o sim e o motivo vai
     * para o funil, à vista do lojista.
     */
    private boolean actAlone(UUID marketId, UUID id, AgentSignal s, CopilotSettingsService.AgentSettings cfg) {
        if (autonomy == null || decisions == null) {
            return false;
        }
        String block = autonomy.blockReason(marketId, s, cfg);
        if (block != null) {
            jdbc.update("update ai_decisions set funnel = funnel || jsonb_build_object('autonomia', cast(:r as text)) "
                + "where market_id = :m and id = :id", new MapSqlParameterSource().addValue("m", marketId).addValue("id", id)
                .addValue("r", block));
            return false;
        }
        try {
            decisions.approve(marketId, id, "copiloto:" + s.agent().toLowerCase() + " (nível 3)");
            jdbc.update("update ai_decisions set auto_executed = true, funnel = funnel || '{\"autonomia\": \"feito sozinho\"}'::jsonb "
                + "where market_id = :m and id = :id", Map.of("m", marketId, "id", id));
            return true;
        } catch (RuntimeException e) {
            log.warn("Nível 3 não executou a decisão {}: {}", id, e.getMessage());
            return false;
        }
    }

    private UUID insert(UUID marketId, AgentSignal s, int level, Verdict v, String status) {
        Map<String, Object> funnel = new LinkedHashMap<>();
        funnel.put("julgamento", v.source());
        funnel.put("vale", v.worth());
        funnel.put("urgente", v.urgent());
        if (v.worthProbability() != null) {
            funnel.put("probabilidadeVale", v.worthProbability());
            funnel.put("confianca", v.confidence());
        }
        List<UUID> ids = jdbc.queryForList("insert into ai_decisions (market_id, agent, kind, scope_key, title, body, numbers, payload, impact, level, "
                + "urgent, status, funnel, signal_hash) values (:m, :a, :k, :s, :t, :b, cast(:n as jsonb), cast(:p as jsonb), :i, :l, "
                + ":u, :st, cast(:f as jsonb), :h) on conflict (market_id, signal_hash) do nothing returning id",
            new MapSqlParameterSource().addValue("m", marketId).addValue("a", s.agent()).addValue("k", s.kind())
                .addValue("s", s.scopeKey()).addValue("t", s.title().length() > 200 ? s.title().substring(0, 199) + "…" : s.title())
                .addValue("b", s.body()).addValue("n", json(s.numbers())).addValue("p", json(s.payload()))
                .addValue("i", s.impact()).addValue("l", level).addValue("u", v.urgent()).addValue("st", status)
                .addValue("f", json(funnel)).addValue("h", s.hash()), UUID.class);
        if (!ids.isEmpty() && !"SILENCIADA".equals(status)) {
            // Proposta nova do mesmo assunto substitui a anterior que ninguém decidiu.
            jdbc.update("update ai_decisions set status = 'EXPIRADA', decision_note = 'Substituída por uma proposta mais nova' "
                    + "where market_id = :m and agent = :a and kind = :k and scope_key = :s and status in ('PENDENTE', 'INFORMATIVA') "
                    + "and signal_hash <> :h",
                new MapSqlParameterSource().addValue("m", marketId).addValue("a", s.agent()).addValue("k", s.kind())
                    .addValue("s", s.scopeKey()).addValue("h", s.hash()));
        }
        return ids.isEmpty() ? null : ids.get(0);
    }

    private int count(String sql, MapSqlParameterSource p) {
        Integer v = jdbc.queryForObject(sql, p, Integer.class);
        return v == null ? 0 : v;
    }

    private String json(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (Exception e) {
            return "{}";
        }
    }
}
