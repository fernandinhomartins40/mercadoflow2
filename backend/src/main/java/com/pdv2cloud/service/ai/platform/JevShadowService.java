package com.pdv2cloud.service.ai.platform;

import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.service.ai.AiUsageRecorder;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Jev em modo sombra: decide em paralelo, sem afetar o produto, e guarda a
 * decisão ao lado da referência (o que o DeepSeek escolheu, ou o que o lojista
 * fez). É assim que medimos o acerto do Jev em português antes de deixá-lo
 * decidir de verdade — o painel mostra a taxa de concordância por tarefa.
 *
 * Roda numa fila própria e pequena: nunca atrasa a resposta ao lojista, e se a
 * fila encher, a amostra é descartada (é medição, não produto).
 */
@Service
public class JevShadowService {

    private static final Logger log = LoggerFactory.getLogger(JevShadowService.class);

    private final AiGate gate;
    private final JevClient jev;
    private final AiUsageRecorder usage;
    private final NamedParameterJdbcTemplate jdbc;
    private final ExecutorService executor = new ThreadPoolExecutor(1, 2, 30, TimeUnit.SECONDS,
        new LinkedBlockingQueue<>(200), r -> {
            Thread t = new Thread(r, "jev-sombra");
            t.setDaemon(true);
            return t;
        }, new ThreadPoolExecutor.DiscardPolicy());

    public JevShadowService(AiGate gate, JevClient jev, AiUsageRecorder usage, NamedParameterJdbcTemplate jdbc) {
        this.gate = gate;
        this.jev = jev;
        this.usage = usage;
        this.jdbc = jdbc;
    }

    /** Tool = nome e descrição de uma consulta que o chat oferece. */
    public record Tool(String name, String description) {}

    /**
     * Qual consulta responde a pergunta? Referência: a primeira consulta que o
     * DeepSeek pediu ("nenhuma" quando respondeu direto).
     */
    public void toolChoice(UUID marketId, String question, List<Tool> tools, String reference) {
        Map<String, String> options = new LinkedHashMap<>();
        for (Tool t : tools) {
            options.put(t.name(), clip(t.description(), 220));
        }
        options.put("nenhuma", "responder sem consultar dados: cumprimento, agradecimento ou pergunta sobre o assistente");
        submit(marketId, "JEV_FERRAMENTA", question,
            Map.of("ferramenta", JevClient.Question.choice(
                "Qual consulta aos dados da loja responde a pergunta do lojista de supermercado?", options)),
            "ferramenta", reference);
    }

    /**
     * O texto do sistema já explica bem a oportunidade? Referência: o lojista
     * pediu o "Por quê?", então para ele a resposta foi "não".
     */
    public void explanationNeeded(UUID marketId, String systemText) {
        submit(marketId, "JEV_VALE_EXPLICAR", systemText,
            Map.of("suficiente", JevClient.Question.yesNo(
                "Este texto já explica, para um dono de supermercado, o motivo e o que fazer, sem precisar de mais detalhes?")),
            "suficiente", "nao");
    }

    private void submit(UUID marketId, String task, String state, Map<String, JevClient.Question> questions,
                        String key, String reference) {
        AiGate.Decision d;
        try {
            d = gate.decide(marketId, task);
        } catch (RuntimeException e) {
            return;
        }
        if (!d.allowed() || !d.route().shadow()) {
            return;
        }
        executor.execute(() -> TenantContext.runAsSystem(() -> {
            try {
                JevClient.Result r = jev.decide(d.key().baseUrl(), d.key().apiKey(), d.model(), state, questions);
                double cost = AiGate.costUsd(d.route(), r.inputTokens(), 0);
                usage.recordFull(marketId, task, "JEV", d.model(), "sombra-v1", null, r.inputTokens(), 0,
                    (int) r.latencyMs(), r.success() ? AiUsageLog.Outcome.OK : AiUsageLog.Outcome.ERRO,
                    r.error(), cost, "JEV", 0, true);
                if (!r.success() || !r.answers().containsKey(key)) {
                    return;
                }
                JevClient.Answer a = r.answers().get(key);
                jdbc.update("insert into ai_shadow_decisions (market_id, task, jev_answer, jev_confidence, reference_answer, "
                        + "agreed, latency_ms, input_tokens) values (:m, :t, :a, :c, :ref, :ok, :ms, :in)",
                    new MapSqlParameterSource().addValue("m", marketId).addValue("t", task).addValue("a", clip(a.answer(), 120))
                        .addValue("c", a.confidence()).addValue("ref", clip(reference, 120))
                        .addValue("ok", reference != null && reference.equals(a.answer()))
                        .addValue("ms", (int) r.latencyMs()).addValue("in", r.inputTokens()));
            } catch (Exception e) {
                log.debug("Amostra do Jev em sombra descartada: {}", e.getMessage());
            }
        }));
    }

    private static String clip(String s, int max) {
        return s == null ? null : s.length() > max ? s.substring(0, max) : s;
    }
}
