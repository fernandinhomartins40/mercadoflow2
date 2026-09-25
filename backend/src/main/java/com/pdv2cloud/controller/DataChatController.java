package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.PlanService;
import com.pdv2cloud.service.ai.LlmClient;
import com.pdv2cloud.service.ai.chat.ChatDemoService;
import com.pdv2cloud.service.ai.chat.DataChatService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * "Pergunte aos dados": o lojista pergunta em português e o sistema responde
 * consultando os números reais da loja.
 *
 * O histórico da conversa vem do cliente a cada requisição, e não do banco.
 * A razão é que uma conversa sobre dados não tem valor de arquivo — o que
 * importa é a decisão, e essa já é registrada em {@code recommendations}.
 * Guardar as conversas criaria uma cópia dos números da loja num lugar a mais
 * sem que ninguém fosse consultá-la depois.
 *
 * Aceita MARKET_MANAGER além do dono: consultar dados é leitura, e o gerente
 * já vê os mesmos números nas telas. Diferente de cadastrar chave de IA, que
 * é compromisso financeiro e fica restrito ao dono.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/ai/chat")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class DataChatController {

    /**
     * Quantas mensagens anteriores são reenviadas ao modelo.
     *
     * O histórico inteiro cresceria sem limite e o cliente pagaria por ele em
     * toda pergunta. Seis mensagens (três trocas) cobrem o encadeamento real
     * — "e no mês passado?", "e desses, qual gira menos?".
     */
    private static final int MAX_HISTORY_MESSAGES = 6;

    /** Teto de caracteres da pergunta, contra colagem de texto enorme. */
    private static final int MAX_QUESTION_CHARS = 500;

    private final DataChatService chatService;
    private final ChatDemoService demoService;
    private final MarketAccessService marketAccessService;
    private final PlanService planService;

    public DataChatController(
        DataChatService chatService,
        ChatDemoService demoService,
        MarketAccessService marketAccessService,
        PlanService planService
    ) {
        this.chatService = chatService;
        this.demoService = demoService;
        this.marketAccessService = marketAccessService;
        this.planService = planService;
    }

    /**
     * Estado do recurso para a tela decidir o que mostrar.
     *
     * Sem chave configurada, a tela exibe o convite para configurar em vez de
     * um campo de pergunta que falharia no primeiro envio.
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);

        boolean paidPlan = planService.limitsFor(marketId).fullInsights();
        Map<String, Object> body = new LinkedHashMap<>();

        if (!paidPlan) {
            // Gratuito: a tela não fica trancada. Mostra três perguntas já
            // respondidas com os números REAIS da loja de quem está olhando —
            // ver a resposta que teria gera desejo, enquanto uma parede não
            // gera, porque o lojista nem descobre o que está perdendo.
            body.put("disponivel", false);
            body.put("modoDemonstracao", true);
            body.put("exemplos", demoService.demoAnswers(marketId));
            body.put("mensagem", "Estas respostas usam os dados da sua loja. "
                + "No plano pago você pergunta o que quiser.");
            return ResponseEntity.ok(body);
        }

        body.put("disponivel", chatService.isAvailable(marketId));
        body.put("modoDemonstracao", false);
        body.put("sugestoes", chatService.suggestedQuestions());
        return ResponseEntity.ok(body);
    }

    /** Faz uma pergunta sobre os dados da loja. */
    @PostMapping
    public ResponseEntity<?> ask(
        @PathVariable("marketId") UUID marketId,
        @RequestBody AskRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);

        if (!planService.limitsFor(marketId).fullInsights()) {
            // 200 e não 403: para a tela isto é um estado da conversa, não erro
            // de aplicação — e a mensagem é o convite, não uma recusa seca.
            return ResponseEntity.ok(Map.of(
                "sucesso", false,
                "modoDemonstracao", true,
                "erro", "As perguntas livres fazem parte do plano pago. "
                    + "Veja acima três respostas com os dados da sua loja."
            ));
        }

        String question = request.pergunta();
        if (question == null || question.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("erro", "Escreva sua pergunta."));
        }
        if (question.length() > MAX_QUESTION_CHARS) {
            question = question.substring(0, MAX_QUESTION_CHARS);
        }

        DataChatService.ChatAnswer answer =
            chatService.ask(marketId, question, toHistory(request.historico()));

        if (!answer.success()) {
            // 200 com sucesso=false, e não 4xx/5xx: "não configurei a chave" e
            // "o provedor caiu" são estados normais da conversa, que a tela
            // mostra como mensagem — não como erro de aplicação.
            return ResponseEntity.ok(Map.of(
                "sucesso", false,
                "erro", answer.errorMessage() == null
                    ? "Não consegui responder agora." : answer.errorMessage()
            ));
        }

        return ResponseEntity.ok(Map.of(
            "sucesso", true,
            "resposta", answer.answer(),
            // Quais consultas alimentaram a resposta. Vai para a tela porque o
            // lojista tem direito de saber de onde veio o número.
            "consultasUsadas", answer.toolsUsed(),
            "provedor", answer.provider() == null ? "" : answer.provider()
        ));
    }

    /**
     * Converte o histórico do cliente, mantendo só as últimas trocas.
     *
     * Mensagens de ferramenta não são aceitas de volta: o cliente enviaria
     * conteúdo que nunca produzimos, e o laço de ferramentas é sempre montado
     * do zero a cada pergunta.
     */
    private List<LlmClient.ChatMessage> toHistory(List<HistoryMessage> raw) {
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        List<HistoryMessage> recent = raw.size() <= MAX_HISTORY_MESSAGES
            ? raw : raw.subList(raw.size() - MAX_HISTORY_MESSAGES, raw.size());

        List<LlmClient.ChatMessage> messages = new ArrayList<>();
        for (HistoryMessage m : recent) {
            if (m == null || m.texto() == null || m.texto().isBlank()) {
                continue;
            }
            if ("usuario".equalsIgnoreCase(m.autor())) {
                messages.add(LlmClient.ChatMessage.user(m.texto()));
            } else if ("assistente".equalsIgnoreCase(m.autor())) {
                messages.add(LlmClient.ChatMessage.assistant(m.texto()));
            }
        }
        return messages;
    }

    public record AskRequest(String pergunta, List<HistoryMessage> historico) { }

    /** @param autor "usuario" ou "assistente" */
    public record HistoryMessage(String autor, String texto) { }
}
