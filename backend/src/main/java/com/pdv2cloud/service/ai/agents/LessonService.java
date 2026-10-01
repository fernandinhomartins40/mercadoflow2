package com.pdv2cloud.service.ai.agents;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Memória da loja (proposta, seção 6.6): lições curtas com evidência, escritas
 * por código a partir do que aconteceu. Nenhum modelo de linguagem: o
 * histórico bruto fica no banco e só a frase com os números vai para a IA,
 * quando ela é chamada.
 */
@Service
public class LessonService {

    private static final Map<String, String> ACTION_LABEL = Map.of(
        "COMPRAR", "compra sugerida", "PROMOVER", "promoção", "LIQUIDAR", "liquidação",
        "AJUSTAR_PRECO", "ajuste de preço", "REPOSICIONAR", "troca de lugar na loja");

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper mapper = new ObjectMapper();

    public LessonService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Lesson(UUID id, String scope, String scopeKey, String topic, String text, double weight,
                         LocalDateTime updatedAt) {}

    public List<Lesson> all(UUID marketId) {
        return jdbc.query("select id, scope, scope_key, topic, text, weight, updated_at from ai_lessons where market_id = :m "
            + "order by updated_at desc limit 200", Map.of("m", marketId), (rs, i) -> new Lesson((UUID) rs.getObject("id"),
            rs.getString("scope"), rs.getString("scope_key"), rs.getString("topic"), rs.getString("text"), rs.getDouble("weight"),
            rs.getTimestamp("updated_at").toLocalDateTime()));
    }

    /** Lições de um assunto (fornecedor, agente, tipo de ação). */
    public List<Lesson> about(UUID marketId, String scopeKey) {
        return all(marketId).stream().filter(l -> l.scopeKey().equals(scopeKey)).toList();
    }

    void upsert(UUID marketId, String scope, String scopeKey, String topic, String text, Map<String, Object> evidence,
                double weight, String source) {
        jdbc.update("insert into ai_lessons (market_id, scope, scope_key, topic, text, evidence, weight, source) "
                + "values (:m, :s, :k, :t, :x, cast(:e as jsonb), :w, :src) on conflict (market_id, scope, scope_key, topic) "
                + "do update set text = excluded.text, evidence = excluded.evidence, weight = excluded.weight, updated_at = now()",
            new MapSqlParameterSource().addValue("m", marketId).addValue("s", scope).addValue("k", clip(scopeKey, 120))
                .addValue("t", topic).addValue("x", clip(text, 400)).addValue("e", json(evidence)).addValue("w", weight)
                .addValue("src", source));
    }

    /** Fornecedor que entrega com falta: das últimas conferências encerradas (até 6), quantas tiveram falta. */
    public int refreshSuppliers(UUID marketId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select emitter_cnpj, max(emitter_name) as nome, count(*) as entregas, "
                + "count(*) filter (where jsonb_array_length(coalesce(summary->'falta', '[]'::jsonb)) > 0) as faltas "
                + "from (select d.emitter_cnpj, d.emitter_name, c.summary, row_number() over (partition by d.emitter_cnpj "
                + "order by c.finished_at desc) as rn from confere_checks c join nfe_documents d on d.id = c.document_id "
                + "where c.market_id = :m and c.status = 'DONE' and d.emitter_cnpj is not null) x where rn <= 6 "
                + "group by emitter_cnpj having count(*) >= 2", Map.of("m", marketId));
        int n = 0;
        for (Map<String, Object> r : rows) {
            int entregas = ((Number) r.get("entregas")).intValue();
            int faltas = ((Number) r.get("faltas")).intValue();
            String nome = r.get("nome") == null ? "Fornecedor " + r.get("emitter_cnpj") : String.valueOf(r.get("nome"));
            if (faltas == 0) {
                jdbc.update("delete from ai_lessons where market_id = :m and scope = 'FORNECEDOR' and scope_key = :k and topic = 'faltas'",
                    Map.of("m", marketId, "k", String.valueOf(r.get("emitter_cnpj"))));
                continue;
            }
            upsert(marketId, "FORNECEDOR", String.valueOf(r.get("emitter_cnpj")), "faltas",
                nome + " entregou com falta em " + faltas + " das últimas " + entregas + " conferências.",
                Map.of("faltas", faltas, "entregas", entregas), (double) faltas / entregas, "CONFERE");
            n++;
        }
        return n;
    }

    /** Resultado medido das decisões aceitas, por tipo de ação: "promoção: deu certo em 1 de 3". */
    public int refreshOutcomes(UUID marketId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select action_type, count(*) as medidas, count(*) filter (where verdict = 'ACERTOU') as acertos "
                + "from recommendation_outcomes where market_id = :m and measured_at is not null and verdict is not null "
                + "and verdict <> 'SEM_DADOS' and action_type is not null group by action_type having count(*) >= 2",
            Map.of("m", marketId));
        for (Map<String, Object> r : rows) {
            String action = String.valueOf(r.get("action_type"));
            int medidas = ((Number) r.get("medidas")).intValue();
            int acertos = ((Number) r.get("acertos")).intValue();
            upsert(marketId, "ACAO", action, "resultado",
                capitalize(ACTION_LABEL.getOrDefault(action, action.toLowerCase())) + " aceita deu o resultado esperado em "
                    + acertos + " de " + medidas + " vezes medidas.",
                Map.of("acertos", acertos, "medidas", medidas), (double) acertos / medidas, "RESULTADO");
        }
        return rows.size();
    }

    /** Recusa do lojista vira preferência: o agente não volta a propor o mesmo tão cedo. */
    public void fromRefusal(UUID marketId, String agent, String kind, String scopeKey, String title, String reason) {
        String when = LocalDateTime.now(CopilotSettingsService.ZONE).format(DateTimeFormatter.ofPattern("dd/MM"));
        upsert(marketId, "PREFERENCIA", agent + ":" + (scopeKey == null ? "-" : scopeKey), "recusa-" + kind.toLowerCase(),
            "O dono recusou \"" + clip(title, 120) + "\" em " + when + (reason == null || reason.isBlank() ? "." : ": " + clip(reason, 120) + "."),
            Map.of("agente", agent, "tipo", kind), 1, "RECUSA");
    }

    private static String capitalize(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private static String clip(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    private String json(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (Exception e) {
            return "{}";
        }
    }
}
