package com.pdv2cloud.service.ai.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.service.ai.AiUsageRecorder;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Voz do Copiloto (proposta, seção 7). O padrão é grátis e roda no celular:
 * reconhecimento e voz do próprio navegador, e a lista fixa de comandos lida
 * por código. Aqui ficam só as reservas pagas:
 * <ul>
 *   <li>transcrição pelo Deepgram, quando o navegador não reconhece fala
 *       (o áudio passa direto e não é guardado);</li>
 *   <li>o Jev, quando a lista fixa não reconheceu o comando: ele só escolhe
 *       entre as ações permitidas naquela tela, nunca lê número.</li>
 * </ul>
 */
@Service
public class VoiceService {

    private static final Logger log = LoggerFactory.getLogger(VoiceService.class);

    public static final String TRANSCRIBE_TASK = "VOZ_TRANSCRICAO";
    public static final String COMMAND_TASK = "JEV_COMANDO_VOZ";
    /** 1 minuto de áudio compactado (webm/opus, mp4/aac) fica bem abaixo disso. */
    public static final int MAX_AUDIO_BYTES = 2 * 1024 * 1024;
    private static final Set<String> AUDIO_TYPES = Set.of("audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav",
        "audio/x-wav", "audio/aac");

    /** Ações que cada tela aceita por voz (a mesma lista do celular). */
    static final Map<String, Map<String, String>> ACTIONS = Map.of(
        "CONFERENCIA", ordered(
            "somar", "somar unidades à contagem do produto (mais dois, põe mais três, chegou mais um)",
            "tirar", "tirar unidades da contagem (menos um, tira dois)",
            "definir", "dizer quanto contou (contei doze, são 12, tem vinte)",
            "veio_certo", "a quantidade confere com a nota (veio certo, bateu, tá certo)",
            "avaria", "produto avariado, amassado, quebrado ou vazando",
            "validade", "validade curta ou vencendo",
            "trocado", "veio produto errado ou trocado",
            "proximo", "ir para o próximo produto",
            "anterior", "voltar ao produto anterior",
            "revisar", "terminar e revisar as diferenças"),
        "RESUMO", ordered(
            "aprovar", "aprovar o que o Copiloto preparou (aprova, pode fazer, manda ver, confirmo)",
            "detalhe", "ver os detalhes ou abrir os assuntos do dia",
            "depois", "deixar para depois, parar de ouvir",
            "repetir", "ouvir de novo",
            "pergunta", "fazer uma pergunta sobre vendas, estoque ou compras"));

    private final AiGate gate;
    private final JevClient jev;
    private final AiUsageRecorder usage;
    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
    private final ObjectMapper mapper = new ObjectMapper();

    public VoiceService(AiGate gate, JevClient jev, AiUsageRecorder usage) {
        this.gate = gate;
        this.jev = jev;
        this.usage = usage;
    }

    public record Transcript(boolean ok, String texto, String aviso, int creditosUsados) {}

    public record Command(String acao, double confianca, String origem) {}

    /** Transcreve um áudio curto pelo Deepgram, cobrando créditos. */
    public Transcript transcribe(UUID marketId, byte[] audio, String contentType) {
        if (audio == null || audio.length == 0) {
            return new Transcript(false, null, "Não chegou áudio.", 0);
        }
        if (audio.length > MAX_AUDIO_BYTES) {
            return new Transcript(false, null, "Áudio longo demais: fale até 1 minuto.", 0);
        }
        String type = contentType == null ? "" : contentType.split(";")[0].trim().toLowerCase();
        if (!AUDIO_TYPES.contains(type)) {
            return new Transcript(false, null, "Formato de áudio não aceito.", 0);
        }
        AiGate.Decision d = gate.decide(marketId, TRANSCRIBE_TASK);
        if (!d.allowed()) {
            return new Transcript(false, null, d.reason() == AiGate.Reason.NO_CREDITS || d.reason() == AiGate.Reason.DAILY_BUDGET
                ? d.message() : "A transcrição por voz não está disponível. Digite a pergunta.", 0);
        }
        long started = System.currentTimeMillis();
        try {
            String url = d.key().baseUrl() + "/v1/listen?model=" + URLEncoder.encode(d.model(), StandardCharsets.UTF_8)
                + "&language=pt-BR&smart_format=true&numerals=true";
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .header("Authorization", "Token " + d.key().apiKey())
                .header("Content-Type", type)
                .POST(HttpRequest.BodyPublishers.ofByteArray(audio))
                .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            long ms = System.currentTimeMillis() - started;
            if (res.statusCode() < 200 || res.statusCode() >= 300) {
                record(marketId, d, 0, ms, AiUsageLog.Outcome.ERRO, "HTTP " + res.statusCode(), 0);
                return new Transcript(false, null, "Não consegui entender o áudio agora. Tente de novo ou digite.", 0);
            }
            JsonNode root = mapper.readTree(res.body());
            String text = root.path("results").path("channels").path(0).path("alternatives").path(0).path("transcript").asText("").trim();
            int seconds = (int) Math.ceil(root.path("metadata").path("duration").asDouble(0));
            int credits = text.isEmpty() ? 0 : gate.charge(marketId, d.route(), "voz");
            record(marketId, d, seconds, ms, AiUsageLog.Outcome.OK, null, credits);
            return text.isEmpty()
                ? new Transcript(false, null, "Não ouvi nada. Aperte e fale perto do celular.", 0)
                : new Transcript(true, text, null, credits);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Transcript(false, null, "A transcrição foi interrompida.", 0);
        } catch (Exception e) {
            log.warn("Transcrição falhou: {}", e.getMessage());
            record(marketId, d, 0, System.currentTimeMillis() - started, AiUsageLog.Outcome.ERRO, "falha de comunicação", 0);
            return new Transcript(false, null, "Não consegui entender o áudio agora. Tente de novo ou digite.", 0);
        }
    }

    /**
     * Comando que a lista fixa do celular não reconheceu: o Jev escolhe entre as
     * ações da tela. Abaixo do limite de confiança da rota, devolve ação nula
     * (a tela pede para repetir).
     */
    public Command command(UUID marketId, String context, String text) {
        Map<String, String> actions = ACTIONS.get(context);
        if (actions == null || text == null || text.isBlank()) {
            return new Command(null, 0, "NENHUMA");
        }
        String clean = text.trim();
        if (clean.length() > 300) {
            clean = clean.substring(0, 300);
        }
        AiGate.Decision d = gate.decide(marketId, COMMAND_TASK);
        if (!d.allowed()) {
            return new Command(null, 0, "INDISPONIVEL");
        }
        Map<String, String> options = new LinkedHashMap<>(actions);
        options.put("nenhuma", "nada disso, conversa ou barulho");
        JevClient.Result r = jev.decide(d.key().baseUrl(), d.key().apiKey(), d.model(),
            Map.of("tela", context, "fala", clean),
            Map.of("acao", JevClient.Question.choice(
                "O que a pessoa pediu ao falar com o aplicativo, nesta tela de supermercado?", options)));
        double cost = AiGate.costUsd(d.route(), r.inputTokens(), 0);
        usage.recordFull(marketId, COMMAND_TASK, "JEV", d.model(), "voz-v1", null, r.inputTokens(), 0, (int) r.latencyMs(),
            r.success() ? AiUsageLog.Outcome.OK : AiUsageLog.Outcome.ERRO, r.error(), cost, "JEV", 0, true);
        JevClient.Answer a = r.success() ? r.answers().get("acao") : null;
        if (a == null || "nenhuma".equals(a.answer()) || !actions.containsKey(a.answer())
            || a.confidence() < d.route().jevThreshold()) {
            return new Command(null, a == null ? 0 : a.confidence(), "JEV");
        }
        return new Command(a.answer(), a.confidence(), "JEV");
    }

    private void record(UUID marketId, AiGate.Decision d, int seconds, long ms, AiUsageLog.Outcome outcome, String error,
                        int credits) {
        usage.recordFull(marketId, TRANSCRIBE_TASK, "DEEPGRAM", d.model(), "voz-v1", null, seconds, 0, (int) ms, outcome,
            error, AiGate.costUsd(d.route(), seconds, 0), "VOZ", credits, true);
    }

    private static Map<String, String> ordered(String... kv) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put(kv[i], kv[i + 1]);
        }
        return m;
    }
}
