package com.pdv2cloud.service.ai.agents;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Agente de Recebimento: quando uma conferência do Confere termina com falta,
 * sobra ou problema, prepara a mensagem ao fornecedor (texto pronto, sem IA)
 * e lembra o histórico dele. Aprovado, abre o WhatsApp do lojista com a
 * mensagem: quem envia é a loja, do próprio número.
 */
@Component
public class RecebimentoAgent implements CopilotAgent {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM");

    private final NamedParameterJdbcTemplate jdbc;
    private final LessonService lessons;
    private final ObjectMapper mapper = new ObjectMapper();

    public RecebimentoAgent(NamedParameterJdbcTemplate jdbc, LessonService lessons) {
        this.jdbc = jdbc;
        this.lessons = lessons;
    }

    @Override
    public String name() {
        return "RECEBIMENTO";
    }

    @Override
    public List<AgentSignal> signals(UUID marketId) {
        lessons.refreshSuppliers(marketId);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select c.id, c.document_id, c.summary::text as summary, c.finished_at, d.emitter_name, d.emitter_cnpj, d.number "
                + "from confere_checks c join nfe_documents d on d.id = c.document_id where c.market_id = :m and c.status = 'DONE' "
                + "and c.finished_at >= now() - interval '3 days' order by c.finished_at desc limit 20", Map.of("m", marketId));
        List<AgentSignal> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            JsonNode s = read((String) r.get("summary"));
            List<String> falta = list(s.path("falta"));
            List<String> sobra = list(s.path("sobra"));
            List<String> issues = list(s.path("issues"));
            int problems = falta.size() + sobra.size() + issues.size();
            if (problems == 0) {
                continue;
            }
            String supplier = r.get("emitter_name") == null ? "o fornecedor" : String.valueOf(r.get("emitter_name"));
            String cnpj = r.get("emitter_cnpj") == null ? "-" : String.valueOf(r.get("emitter_cnpj"));
            String number = r.get("number") == null ? "" : String.valueOf(r.get("number"));
            String when = ((java.sql.Timestamp) r.get("finished_at")).toLocalDateTime().format(DAY);
            String message = supplierMessage(supplier, number, when, falta, sobra, issues);
            StringBuilder body = new StringBuilder("A entrega da nota ").append(number.isEmpty() ? "" : number + " ")
                .append("veio com ").append(problems).append(problems == 1 ? " diferença." : " diferenças.");
            lessons.about(marketId, cnpj).forEach(l -> body.append("\n").append(l.text()));
            body.append("\n\nMensagem pronta para o fornecedor:\n").append(message);
            Map<String, Object> numbers = new LinkedHashMap<>();
            numbers.put("faltas", falta.size());
            numbers.put("sobras", sobra.size());
            numbers.put("problemas", issues.size());
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("checkId", String.valueOf(r.get("id")));
            payload.put("documentId", String.valueOf(r.get("document_id")));
            payload.put("mensagem", message);
            out.add(new AgentSignal(name(), "MENSAGEM_FORNECEDOR", cnpj, "Avisar " + supplier + ": " + problems
                + (problems == 1 ? " diferença na entrega" : " diferenças na entrega"), body.toString(), numbers, payload,
                null, true, r.get("id") + "|" + r.get("finished_at")));
        }
        return out;
    }

    @Override
    public Map<String, Object> execute(UUID marketId, Map<String, Object> payload, String actor) {
        String message = String.valueOf(payload.getOrDefault("mensagem", ""));
        return Map.of("whatsappUrl", "https://wa.me/?text=" + URLEncoder.encode(message, StandardCharsets.UTF_8).replace("+", "%20"),
            "mensagem", message);
    }

    /** Mesmo formato do texto que o Confere já monta para o WhatsApp. */
    static String supplierMessage(String supplier, String number, String when, List<String> falta, List<String> sobra,
                                  List<String> issues) {
        StringBuilder sb = new StringBuilder("Olá, ").append(supplier).append(". Conferimos a entrega")
            .append(number.isEmpty() ? "" : " da nota " + number).append(" em ").append(when).append(" e encontramos:");
        if (!falta.isEmpty()) {
            sb.append("\n\nFaltou:");
            falta.forEach(l -> sb.append("\n- ").append(l));
        }
        if (!sobra.isEmpty()) {
            sb.append("\n\nVeio a mais:");
            sobra.forEach(l -> sb.append("\n- ").append(l));
        }
        if (!issues.isEmpty()) {
            sb.append("\n\nProblemas:");
            issues.forEach(l -> sb.append("\n- ").append(l));
        }
        sb.append("\n\nPodemos combinar a reposição ou o abatimento? Obrigado.");
        return sb.toString();
    }

    private JsonNode read(String json) {
        try {
            return json == null ? mapper.createObjectNode() : mapper.readTree(json);
        } catch (Exception e) {
            return mapper.createObjectNode();
        }
    }

    private static List<String> list(JsonNode n) {
        List<String> out = new ArrayList<>();
        if (n.isArray()) {
            n.forEach(x -> out.add(x.asText()));
        }
        return out;
    }
}
