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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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
        boolean retryable,
        /**
         * Ferramentas que o modelo pediu para executar. Vazio numa resposta
         * final; preenchido quando ele precisa de dados antes de responder.
         */
        List<ToolCall> toolCalls
    ) {
        public static LlmResponse ok(String content, Integer in, Integer out, long ms) {
            return new LlmResponse(true, content, in, out, ms, null, false, List.of());
        }

        public static LlmResponse withToolCalls(
            List<ToolCall> calls, Integer in, Integer out, long ms
        ) {
            return new LlmResponse(true, null, in, out, ms, null, false, calls);
        }

        public static LlmResponse fail(String message, boolean retryable, long ms) {
            return new LlmResponse(false, null, null, null, ms, message, retryable, List.of());
        }

        /** O modelo quer dados antes de responder. */
        public boolean needsTools() {
            return toolCalls != null && !toolCalls.isEmpty();
        }
    }

    /**
     * Um pedido de execução de ferramenta.
     *
     * @param id        identificador que o provedor gerou; a resposta precisa
     *                  citá-lo para o modelo saber a qual pedido ela responde
     * @param name      nome da ferramenta
     * @param arguments argumentos em JSON, como o modelo os produziu
     */
    public record ToolCall(String id, String name, String arguments) { }

    /**
     * Uma mensagem do histórico da conversa.
     *
     * @param toolCalls quando o assistente pediu ferramentas. A API exige que
     *                  essa mensagem seja reenviada junto dos resultados —
     *                  mandar um {@code role: tool} sem o {@code assistant} que
     *                  o originou é erro 400 em todos os provedores.
     */
    public record ChatMessage(
        String role, String content, String toolCallId, String name, List<ToolCall> toolCalls
    ) {
        public static ChatMessage system(String content) {
            return new ChatMessage("system", content, null, null, List.of());
        }

        public static ChatMessage user(String content) {
            return new ChatMessage("user", content, null, null, List.of());
        }

        public static ChatMessage assistant(String content) {
            return new ChatMessage("assistant", content, null, null, List.of());
        }

        /** O assistente pedindo ferramentas — precisa voltar no histórico. */
        public static ChatMessage assistantToolCalls(List<ToolCall> calls) {
            return new ChatMessage("assistant", null, null, null, calls);
        }

        /** Resultado de uma ferramenta, devolvido ao modelo. */
        public static ChatMessage toolResult(String toolCallId, String name, String content) {
            return new ChatMessage("tool", content, toolCallId, name, List.of());
        }
    }

    /** Definição de ferramenta enviada ao modelo. */
    public record ToolSpec(String name, String description, Map<String, Object> parameters) { }

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

    /**
     * Conversa com histórico e ferramentas disponíveis.
     *
     * A diferença para o {@link #chat} não é só de assinatura: aqui o modelo
     * pode responder pedindo a execução de uma ferramenta em vez de texto. Quem
     * roda esse laço é o {@code DataChatService} — este método faz exatamente
     * uma ida ao provedor.
     *
     * @param tools ferramentas oferecidas; lista vazia força resposta em texto
     */
    public LlmResponse converse(
        String baseUrl,
        String apiKey,
        String model,
        List<ChatMessage> messages,
        List<ToolSpec> tools,
        int maxTokens,
        double temperature
    ) {
        long started = System.currentTimeMillis();
        try {
            String body = buildConversationBody(model, messages, tools, maxTokens, temperature);

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
                return parseConversation(response.body(), elapsed);
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
            log.warn("Falha na conversa de IA para {}: {}", baseUrl, e.getMessage());
            return LlmResponse.fail("Falha de comunicação com o provedor de IA",
                true, System.currentTimeMillis() - started);
        }
    }

    private String buildConversationBody(
        String model, List<ChatMessage> messages, List<ToolSpec> tools,
        int maxTokens, double temperature
    ) {
        ObjectNode root = mapper.createObjectNode();
        root.put("model", model);
        root.put("max_tokens", maxTokens);
        root.put("temperature", temperature);
        root.put("stream", false);

        ArrayNode msgs = root.putArray("messages");
        for (ChatMessage m : messages) {
            ObjectNode node = msgs.addObject();
            node.put("role", m.role());

            if (m.toolCalls() != null && !m.toolCalls().isEmpty()) {
                // Assistente pedindo ferramentas: content vai como null (não
                // string vazia — alguns provedores recusam) e as chamadas
                // originais são reenviadas na forma em que vieram.
                node.putNull("content");
                ArrayNode calls = node.putArray("tool_calls");
                for (ToolCall call : m.toolCalls()) {
                    ObjectNode c = calls.addObject();
                    c.put("id", call.id());
                    c.put("type", "function");
                    ObjectNode fn = c.putObject("function");
                    fn.put("name", call.name());
                    fn.put("arguments", call.arguments());
                }
            } else {
                node.put("content", m.content() == null ? "" : m.content());
            }

            // A mensagem de resultado precisa citar o id do pedido: sem ele o
            // modelo não sabe a qual das ferramentas chamadas ela responde.
            if (m.toolCallId() != null) {
                node.put("tool_call_id", m.toolCallId());
            }
            if (m.name() != null) {
                node.put("name", m.name());
            }
        }

        if (tools != null && !tools.isEmpty()) {
            ArrayNode toolsNode = root.putArray("tools");
            for (ToolSpec t : tools) {
                ObjectNode tool = toolsNode.addObject();
                tool.put("type", "function");
                ObjectNode fn = tool.putObject("function");
                fn.put("name", t.name());
                fn.put("description", t.description());
                fn.set("parameters", mapper.valueToTree(t.parameters()));
            }
            // "auto": o modelo decide se consulta os dados ou responde direto.
            // Forçar chamada faria perguntas triviais ("bom dia") virarem query.
            root.put("tool_choice", "auto");
        }

        return root.toString();
    }

    /**
     * Interpreta a resposta, que pode ser texto final OU pedidos de ferramenta.
     *
     * Alguns provedores devolvem os dois: texto de preâmbulo junto das
     * chamadas. Nesse caso as chamadas ganham prioridade — o texto seria um
     * "vou verificar" que o usuário não precisa ver.
     */
    private LlmResponse parseConversation(String body, long elapsed) {
        try {
            JsonNode root = mapper.readTree(body);
            JsonNode choices = root.path("choices");
            if (!choices.isArray() || choices.isEmpty()) {
                return LlmResponse.fail("Resposta do provedor sem conteúdo", true, elapsed);
            }

            JsonNode message = choices.get(0).path("message");
            JsonNode usage = root.path("usage");
            Integer in = usage.hasNonNull("prompt_tokens")
                ? usage.get("prompt_tokens").asInt() : null;
            Integer out = usage.hasNonNull("completion_tokens")
                ? usage.get("completion_tokens").asInt() : null;

            JsonNode calls = message.path("tool_calls");
            if (calls.isArray() && !calls.isEmpty()) {
                List<ToolCall> toolCalls = new ArrayList<>();
                for (JsonNode call : calls) {
                    JsonNode fn = call.path("function");
                    String name = fn.path("name").asText(null);
                    if (name == null || name.isBlank()) {
                        continue;
                    }
                    toolCalls.add(new ToolCall(
                        call.path("id").asText(name),
                        name,
                        fn.path("arguments").asText("{}")
                    ));
                }
                if (!toolCalls.isEmpty()) {
                    return LlmResponse.withToolCalls(toolCalls, in, out, elapsed);
                }
            }

            String content = message.path("content").asText("");
            if (content.isBlank()) {
                return LlmResponse.fail("Resposta do provedor vazia", true, elapsed);
            }
            return LlmResponse.ok(content.trim(), in, out, elapsed);

        } catch (Exception e) {
            return LlmResponse.fail("Resposta do provedor em formato inesperado", true, elapsed);
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
