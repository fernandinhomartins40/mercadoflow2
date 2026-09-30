package com.pdv2cloud.service.ai.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pdv2cloud.util.OutboundUrlGuard;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Cliente do Jev (TypeSafe AI): modelo de decisão, não de texto.
 *
 * Contrato ({@code POST {base}/v1/systemone}): um {@code state} (texto ou JSON)
 * e um mapa de perguntas fechadas; a resposta traz, por pergunta, a escolha com
 * a probabilidade de cada opção e a confiança. Saída não é cobrada — só a
 * entrada, a ~US$ 0,042 por milhão de tokens.
 *
 * Não é compatível com {@code /chat/completions}, por isso não passa pelo
 * {@code LlmClient}. Três tipos de pergunta:
 * <ul>
 *   <li>{@code choice}: uma de até 255 opções descritas em {@code criteria};</li>
 *   <li>{@code noul}: probabilidade de a afirmação ser verdadeira;</li>
 *   <li>{@code score}: posição numa escala de níveis descritos em {@code criteria}.</li>
 * </ul>
 * O Jev erra em conta, contagem e datas: quem chama manda números já calculados.
 */
@Component
public class JevClient {

    private static final Logger log = LoggerFactory.getLogger(JevClient.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(8);

    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
    private final ObjectMapper mapper = new ObjectMapper();

    /** Uma pergunta: tipo, instrução e opções (escolha/escala). */
    public record Question(String type, String instructions, Map<String, String> criteria) {
        public static Question choice(String instructions, Map<String, String> options) {
            return new Question("choice", instructions, options);
        }

        public static Question yesNo(String instructions) {
            return new Question("noul", instructions, null);
        }

        public static Question score(String instructions, Map<String, String> levels) {
            return new Question("score", instructions, levels);
        }
    }

    /**
     * Resposta de uma pergunta.
     *
     * @param answer     a opção escolhida (choice/score) ou "sim"/"nao" (noul, corte em 0,5)
     * @param confidence confiança informada; em noul é a distância de 0,5 dobrada
     * @param probability probabilidade de "sim" (só noul)
     */
    public record Answer(String answer, double confidence, Double probability, Map<String, Double> probabilities) {}

    public record Result(boolean success, Map<String, Answer> answers, Integer inputTokens, long latencyMs, String error) {
        static Result fail(String error, long ms) {
            return new Result(false, Map.of(), null, ms, error);
        }
    }

    public Result decide(String baseUrl, String apiKey, String model, Object state, Map<String, Question> questions) {
        long started = System.currentTimeMillis();
        try {
            if (!AiDevMock.isMock(baseUrl)) {
                OutboundUrlGuard.assertPublicHttps(baseUrl);
            }
        } catch (RuntimeException e) {
            return Result.fail("Endereço do Jev não permitido", 0);
        }
        try {
            ObjectNode body = mapper.createObjectNode();
            body.put("model", model == null || model.isBlank() ? "jev-latest" : model);
            if (state instanceof String text) {
                body.put("state", text);
            } else {
                body.set("state", mapper.valueToTree(state));
            }
            ObjectNode qs = body.putObject("questions");
            questions.forEach((key, q) -> {
                ObjectNode node = qs.putObject(key);
                node.put("type", q.type());
                node.put("instructions", q.instructions());
                if (q.criteria() != null && !q.criteria().isEmpty()) {
                    ObjectNode criteria = node.putObject("criteria");
                    q.criteria().forEach(criteria::put);
                }
            });

            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl.replaceAll("/+$", "") + "/v1/systemone"))
                .timeout(TIMEOUT)
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            long elapsed = System.currentTimeMillis() - started;
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return Result.fail(describe(response.statusCode()), elapsed);
            }
            return parse(mapper.readTree(response.body()), questions, elapsed);
        } catch (java.net.http.HttpTimeoutException e) {
            return Result.fail("Tempo esgotado ao chamar o Jev", System.currentTimeMillis() - started);
        } catch (Exception e) {
            log.warn("Falha na chamada ao Jev: {}", e.getMessage());
            return Result.fail("Falha de comunicação com o Jev", System.currentTimeMillis() - started);
        }
    }

    Result parse(JsonNode root, Map<String, Question> questions, long elapsed) {
        Map<String, Answer> out = new LinkedHashMap<>();
        JsonNode answers = root.path("answers");
        for (String key : questions.keySet()) {
            JsonNode a = answers.path(key);
            if (a.isMissingNode()) {
                continue;
            }
            Map<String, Double> probs = new LinkedHashMap<>();
            a.path("probabilities").fields().forEachRemaining(e -> probs.put(e.getKey(), e.getValue().asDouble()));
            if (a.has("noul")) {
                double p = a.path("noul").asDouble();
                out.put(key, new Answer(p >= 0.5 ? "sim" : "nao", Math.abs(p - 0.5) * 2, p, probs));
            } else {
                String value = a.has("choice") ? a.path("choice").asText() : a.path("score").asText();
                double confidence = a.has("confidence") ? a.path("confidence").asDouble()
                    : probs.getOrDefault(value, 0.0);
                out.put(key, new Answer(value, confidence, null, probs));
            }
        }
        JsonNode usage = root.path("usage");
        Integer in = usage.has("input_tokens") ? usage.path("input_tokens").asInt() : null;
        return new Result(true, out, in, elapsed, null);
    }

    private static String describe(int status) {
        return switch (status) {
            case 401, 403 -> "Chave do Jev recusada";
            case 402 -> "Sem saldo na conta do Jev";
            case 429 -> "Limite de uso do Jev atingido";
            default -> status >= 500 ? "Jev indisponível" : "Erro " + status + " do Jev";
        };
    }
}
