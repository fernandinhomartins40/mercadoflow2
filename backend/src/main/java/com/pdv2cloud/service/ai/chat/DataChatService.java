package com.pdv2cloud.service.ai.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.service.ai.AiOrchestrator;
import com.pdv2cloud.service.ai.AiTaskProfile;
import com.pdv2cloud.service.ai.AiUsageRecorder;
import com.pdv2cloud.service.ai.LlmClient;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * "Pergunte aos dados": o lojista pergunta em português, o modelo consulta os
 * números reais e responde.
 *
 * O QUE TORNA ISTO DIFERENTE DE UM CHATBOT: o modelo não recebe os dados da
 * loja no prompt e não tem permissão para inventar. Ele recebe a lista de
 * ferramentas ({@link DataTool}), escolhe quais chamar, e nós executamos a
 * consulta de verdade contra o banco. Todo número que aparece na resposta
 * passou por uma dessas consultas — e o campo {@code toolsUsed} devolve quais
 * foram, para o usuário poder conferir.
 *
 * O laço é: pergunta → o modelo pede ferramentas → executamos → devolvemos os
 * resultados → o modelo responde (ou pede mais). Cortado por dois limites,
 * porque cada volta é uma chamada paga na conta do cliente.
 */
@Service
@Slf4j
public class DataChatService {

    public static final String TASK = "PERGUNTE_AOS_DADOS";

    /**
     * Quantas voltas de ferramenta antes de exigir resposta.
     *
     * Quatro cobre com folga o caso real ("compare as vendas do mês com o mês
     * passado e diga o que comprar" usa duas). O teto existe porque um modelo
     * indeciso pode pedir a mesma ferramenta indefinidamente, e cada volta é
     * dinheiro do cliente.
     */
    private static final int MAX_TOOL_ROUNDS = 4;

    /** Teto de ferramentas por volta, contra o modelo que pede dez de uma vez. */
    private static final int MAX_CALLS_PER_ROUND = 4;

    /**
     * Parâmetros da tarefa, vindos do roteamento da Fase 6
     * ({@link AiTaskProfile}). Aqui a temperatura é zero: a mesma pergunta
     * sobre os mesmos números deve dar a mesma resposta — variação
     * estilística pareceria inconsistência dos dados.
     */
    private static final AiTaskProfile PROFILE = AiTaskProfile.PERGUNTE_AOS_DADOS;

    /** Teto de caracteres do resultado de uma ferramenta. */
    private static final int MAX_TOOL_RESULT_CHARS = 6_000;

    private final AiOrchestrator orchestrator;
    private final AiUsageRecorder usageRecorder;
    private final LlmClient llmClient;
    private final ObjectMapper mapper = new ObjectMapper();
    private final Map<String, DataTool> toolsByName;
    private final List<LlmClient.ToolSpec> toolSpecs;

    public DataChatService(
        AiOrchestrator orchestrator,
        AiUsageRecorder usageRecorder,
        LlmClient llmClient,
        CapitalTools capitalTools,
        SalesTools salesTools,
        OpportunityTools opportunityTools
    ) {
        this.orchestrator = orchestrator;
        this.usageRecorder = usageRecorder;
        this.llmClient = llmClient;

        List<DataTool> all = new ArrayList<>();
        all.addAll(capitalTools.tools());
        all.addAll(salesTools.tools());
        all.addAll(opportunityTools.tools());

        this.toolsByName = all.stream()
            .collect(Collectors.toMap(DataTool::name, Function.identity()));
        this.toolSpecs = all.stream()
            .map(t -> new LlmClient.ToolSpec(t.name(), t.description(), t.parametersSchema()))
            .toList();
    }

    /**
     * A resposta a uma pergunta.
     *
     * @param toolsUsed quais consultas alimentaram a resposta. Vai para a tela:
     *                  o lojista tem direito de saber de onde veio o número, e
     *                  isso é o que separa "a IA disse" de "os dados dizem".
     */
    public record ChatAnswer(
        boolean success,
        String answer,
        List<String> toolsUsed,
        String provider,
        String errorMessage
    ) { }

    /** O chat só existe para quem configurou uma chave. */
    public boolean isAvailable(UUID marketId) {
        return orchestrator.isEnabledFor(marketId);
    }

    /** As perguntas que o chat sabe responder, para a tela sugerir. */
    public List<String> suggestedQuestions() {
        return List.of(
            "O que eu preciso comprar essa semana?",
            "Onde está meu dinheiro parado?",
            "Como foram as vendas do último mês?",
            "Quais produtos mais vendem?",
            "Qual meu horário de maior movimento?",
            "O que o sistema está sugerindo que eu faça?"
        );
    }

    /**
     * Responde a uma pergunta consultando os dados da loja.
     *
     * @param history conversa anterior, para perguntas de continuidade ("e no
     *                mês passado?"). Já deve vir podada pelo chamador.
     */
    public ChatAnswer ask(UUID marketId, String question, List<LlmClient.ChatMessage> history) {
        if (question == null || question.isBlank()) {
            return new ChatAnswer(false, null, List.of(), null, "Pergunta vazia.");
        }

        Optional<AiOrchestrator.ActiveCredential> maybe =
            orchestrator.resolveCredential(marketId);
        if (maybe.isEmpty()) {
            usageRecorder.record(marketId, TASK, null, null, ChatPrompts.VERSION, null,
                null, null, null, AiUsageLog.Outcome.SEM_CREDENCIAL, null);
            return new ChatAnswer(false, null, List.of(), null,
                "Configure uma chave de IA em Conta para usar o Pergunte aos dados.");
        }
        AiOrchestrator.ActiveCredential credential = maybe.get();

        List<LlmClient.ChatMessage> messages = new ArrayList<>();
        messages.add(LlmClient.ChatMessage.system(ChatPrompts.SYSTEM));
        if (history != null) {
            messages.addAll(history);
        }
        messages.add(LlmClient.ChatMessage.user(question));

        List<String> toolsUsed = new ArrayList<>();
        int totalIn = 0;
        int totalOut = 0;
        long totalMs = 0;

        for (int round = 0; round <= MAX_TOOL_ROUNDS; round++) {
            // Na última volta as ferramentas são retiradas: sem elas o modelo
            // não tem alternativa senão responder com o que já coletou. Manter
            // a lista aqui deixaria o laço terminar sem resposta nenhuma.
            boolean lastRound = round == MAX_TOOL_ROUNDS;
            List<LlmClient.ToolSpec> offered = lastRound ? List.of() : toolSpecs;

            LlmClient.LlmResponse response = llmClient.converse(
                credential.baseUrl(), credential.apiKey(), credential.model(),
                messages, offered, PROFILE.maxTokens(), PROFILE.temperature()
            );

            totalIn += value(response.inputTokens());
            totalOut += value(response.outputTokens());
            totalMs += response.latencyMs();

            if (!response.success()) {
                orchestrator.reportFailure(credential.credentialId());
                usageRecorder.record(marketId, TASK, credential.provider().name(),
                    credential.model(), ChatPrompts.VERSION, null, totalIn, totalOut,
                    (int) totalMs, AiUsageLog.Outcome.ERRO, response.errorMessage());
                return new ChatAnswer(false, null, toolsUsed,
                    credential.provider().name(), response.errorMessage());
            }

            if (!response.needsTools()) {
                usageRecorder.record(marketId, TASK, credential.provider().name(),
                    credential.model(), ChatPrompts.VERSION, null, totalIn, totalOut,
                    (int) totalMs, AiUsageLog.Outcome.OK, null);
                return new ChatAnswer(true, response.content(), toolsUsed,
                    credential.provider().name(), null);
            }

            // O modelo quer dados. A mensagem com os pedidos volta ao histórico
            // antes dos resultados — a API recusa resultado órfão.
            List<LlmClient.ToolCall> calls = response.toolCalls().stream()
                .limit(MAX_CALLS_PER_ROUND).toList();
            messages.add(LlmClient.ChatMessage.assistantToolCalls(calls));

            for (LlmClient.ToolCall call : calls) {
                String result = executeTool(marketId, call);
                if (!toolsUsed.contains(call.name())) {
                    toolsUsed.add(call.name());
                }
                messages.add(LlmClient.ChatMessage.toolResult(
                    call.id(), call.name(), result));
            }
        }

        // Inalcançável na prática: a última volta não oferece ferramentas.
        usageRecorder.record(marketId, TASK, credential.provider().name(),
            credential.model(), ChatPrompts.VERSION, null, totalIn, totalOut,
            (int) totalMs, AiUsageLog.Outcome.ERRO, "Limite de consultas atingido");
        return new ChatAnswer(false, null, toolsUsed, credential.provider().name(),
            "Não consegui concluir a análise. Tente uma pergunta mais específica.");
    }

    /**
     * Executa a ferramenta pedida e serializa o resultado.
     *
     * Erro vira texto para o modelo, não exceção: ele consegue se recuperar
     * ("essa consulta falhou, vou tentar outra") de um jeito que uma exceção
     * propagada não permitiria.
     */
    private String executeTool(UUID marketId, LlmClient.ToolCall call) {
        DataTool tool = toolsByName.get(call.name());
        if (tool == null) {
            return "{\"erro\":\"Ferramenta desconhecida\"}";
        }
        try {
            Map<String, Object> args = parseArguments(call.arguments());
            // marketId vem do contexto autenticado, JAMAIS dos argumentos do
            // modelo: bastaria uma alucinação de UUID para atravessar o
            // isolamento entre lojas.
            Map<String, Object> result = tool.execute(marketId, args);
            String json = mapper.writeValueAsString(result);
            return json.length() > MAX_TOOL_RESULT_CHARS
                ? json.substring(0, MAX_TOOL_RESULT_CHARS) + "...\"}"
                : json;
        } catch (Exception e) {
            log.warn("Ferramenta {} falhou: {}", call.name(), e.getMessage());
            return "{\"erro\":\"Não foi possível consultar esses dados agora\"}";
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseArguments(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return mapper.readValue(json, Map.class);
        } catch (Exception e) {
            // Argumento malformado não impede a consulta: quase toda ferramenta
            // tem padrão para todos os parâmetros.
            return new LinkedHashMap<>();
        }
    }

    private static int value(Integer v) {
        return v == null ? 0 : v;
    }
}
