package com.pdv2cloud.service.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Cliente HTTP único para todos os provedores de IA.
 *
 * Só existe uma implementação porque todos os provedores do catálogo
 * ({@link AiProvider}) falam o dialeto {@code POST /chat/completions} da
 * OpenAI. Trocar de provedor é trocar três strings — base URL, chave e modelo —
 * e não escrever uma classe nova.
 *
 * Usa {@code java.net.http.HttpClient} da JDK, como o resto do projeto
 * (crawler de catálogo, imagens): nenhuma dependência nova entra no pom por
 * causa da IA.
 *
 * O cliente NÃO decide fallback, cota nem cache — isso é do
 * {@link AiOrchestrator}. Aqui só há: montar requisição, enviar, interpretar
 * resposta, e distinguir erro que vale tentar outro provedor de erro que não
 * vale.
 */
@Component
public class LlmClient {

    private static final Logger log = LoggerFactory.getLogger(LlmClient.class);

    /**
     * Timeout curto de propósito. A interpretação de oportunidades roda em
     * batch noturno sobre dezenas de itens; um provedor lento travaria a
     * rodada inteira, e o fallback determinístico está sempre disponível.
     */
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(45);

    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();

    private final ObjectMapper mapper = new ObjectMapper();

    /**
     * Resultado de uma chamada.
     *
     * @param retryable erro em que vale tentar o próximo provedor da cadeia
     *                  (rate limit, indisponibilidade, timeout). Chave inválida
     *                  NÃO é retryable no mesmo provedor, mas a cadeia segue
     *                  para o próximo — o que muda é a mensagem guardada.
     */
    public record LlmResponse(
        boolean success,
        String content,
        Integer inputTokens,
        Integer outputTokens,
        long latencyMs,
        String errorMessage,
        boolean retryable
    ) {
        public static LlmResponse ok(String content, Integer in, Integer out, long ms) {
            return new LlmResponse(true, content, in, out, ms, null, false);
        }

        public static LlmResponse fail(String message, boolean retryable, long ms) {
            return new LlmResponse(false, null, null, null, ms, message, retryable);
        }
    }

    /**
     * Uma chamada de chat completion.
     *
     * @param systemPrompt papel e regras do modelo (versionado em
     *                     {@link AiPrompts})
     * @param userPrompt   o contexto estruturado já filtrado pelo Context
     *                     Builder — nunca dado bruto de nota
     * @param maxTokens    teto de saída; protege o bolso do cliente contra uma
     *                     resposta que não termina
     */
    public LlmResponse chat(
        String baseUrl,
        String apiKey,
        String model,
        String systemPrompt,
        String userPrompt,
        int maxTokens,
        double temperature
    ) {
        long started = System.currentTimeMillis();
        try {
            String body = buildRequestBody(model, systemPrompt, userPrompt, maxTokens, temperature);

            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(trimTrailingSlash(baseUrl) + "/chat/completions"))
                .timeout(REQUEST_TIMEOUT)
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

            HttpResponse<String> response =
                http.send(request, HttpResponse.BodyHandlers.ofString());
            long elapsed = System.currentTimeMillis() - started;

            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return parseSuccess(response.body(), elapsed);
            }
            return LlmResponse.fail(
                describeHttpError(response.statusCode(), response.body()),
                isRetryable(response.statusCode()),
                elapsed
            );

        } catch (java.net.http.HttpTimeoutException e) {
            return LlmResponse.fail("Tempo esgotado ao chamar o provedor de IA",
                true, System.currentTimeMillis() - started);
        } catch (Exception e) {
            // Nunca logamos o corpo da requisição: ele contém os números da
            // loja do cliente.
            log.warn("Falha na chamada de IA para {}: {}", baseUrl, e.getMessage());
            return LlmResponse.fail("Falha de comunicação com o provedor de IA",
                true, System.currentTimeMillis() - started);
        }
    }

    private String buildRequestBody(
        String model, String systemPrompt, String userPrompt, int maxTokens, double temperature
    ) {
        ObjectNode root = mapper.createObjectNode();
        root.put("model", model);
        root.put("max_tokens", maxTokens);
        root.put("temperature", temperature);
        // stream=false explícito: alguns gateways compatíveis assumem stream
        // quando o campo é omitido, e a resposta viria em SSE.
        root.put("stream", false);

        ArrayNode messages = root.putArray("messages");
        ObjectNode system = messages.addObject();
        system.put("role", "system");
        system.put("content", systemPrompt);
        ObjectNode user = messages.addObject();
        user.put("role", "user");
        user.put("content", userPrompt);

        return root.toString();
    }

    private LlmResponse parseSuccess(String body, long elapsed) {
        try {
            JsonNode root = mapper.readTree(body);
            JsonNode choices = root.path("choices");
            if (!choices.isArray() || choices.isEmpty()) {
                return LlmResponse.fail("Resposta do provedor sem conteúdo", true, elapsed);
            }
            String content = choices.get(0).path("message").path("content").asText("");
            if (content.isBlank()) {
                return LlmResponse.fail("Resposta do provedor vazia", true, elapsed);
            }

            JsonNode usage = root.path("usage");
            Integer in = usage.hasNonNull("prompt_tokens")
                ? usage.get("prompt_tokens").asInt() : null;
            Integer out = usage.hasNonNull("completion_tokens")
                ? usage.get("completion_tokens").asInt() : null;

            return LlmResponse.ok(content.trim(), in, out, elapsed);
        } catch (Exception e) {
            return LlmResponse.fail("Resposta do provedor em formato inesperado", true, elapsed);
        }
    }

    /**
     * Mensagem curta e sem eco do corpo da resposta: o retorno de erro de
     * alguns gateways devolve o prompt inteiro, que traz os dados da loja.
     */
    private String describeHttpError(int status, String body) {
        return switch (status) {
            case 401, 403 -> "Chave de API rejeitada pelo provedor (HTTP " + status + ")";
            case 404 -> "Modelo ou endpoint não encontrado no provedor (HTTP 404)";
            case 429 -> "Cota ou limite de requisições do provedor atingido (HTTP 429)";
            default -> status >= 500
                ? "Provedor de IA indisponível (HTTP " + status + ")"
                : "Provedor de IA recusou a requisição (HTTP " + status + ")";
        };
    }

    /**
     * 429 e 5xx são transitórios — outro provedor da cadeia pode atender.
     * 401/403/404 são de configuração: tentar de novo no MESMO provedor não
     * resolve (a cadeia ainda avança para o próximo, mas este fica marcado).
     */
    private boolean isRetryable(int status) {
        return status == 429 || status >= 500;
    }

    private static String trimTrailingSlash(String url) {
        return url != null && url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
