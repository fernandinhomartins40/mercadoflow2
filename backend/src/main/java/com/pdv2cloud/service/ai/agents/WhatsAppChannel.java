package com.pdv2cloud.service.ai.agents;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.service.ai.AiUsageRecorder;
import com.pdv2cloud.service.ai.platform.AiGate;
import com.pdv2cloud.service.ai.platform.AiPlatformConfig;
import com.pdv2cloud.service.ai.platform.DailyBriefService;
import com.pdv2cloud.tenancy.TenantContext;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Canal WhatsApp do Copiloto (Cloud API oficial da Meta).
 * <ul>
 *   <li><b>Saída:</b> aviso de decisão e resumo do dia pelo modelo de mensagem
 *       aprovado (corpo {{1}} e botões Aprovar e Depois), só para quem aceitou
 *       receber, fora do horário de silêncio e uma vez por decisão;</li>
 *   <li><b>Entrada:</b> webhook com assinatura HMAC verificada; o botão Aprovar
 *       aprova a decisão, "aprova" por texto aprova a última avisada e "PARAR"
 *       cancela o aceite na hora.</li>
 * </ul>
 * Texto sempre pronto: nenhum modelo de linguagem no canal.
 */
@Service
public class WhatsAppChannel {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppChannel.class);
    public static final String TASK = "WHATSAPP_AVISO";
    static final String API_VERSION = "v21.0";
    /** Avisos por rodada, por mercado: o resto espera a próxima (e o resumo do dia). */
    static final int MAX_PER_RUN = 3;
    /** O resumo vai na primeira rodada depois desta hora, fora do silêncio. */
    static final LocalTime BRIEF_FROM = LocalTime.of(6, 30);
    private static final Map<String, String> AGENT_LABEL = Map.of("GERENTE", "Gerente", "COMPRAS", "Compras", "RECEBIMENTO", "Recebimento",
        "CAPITAL", "Capital parado", "PRECO", "Preço", "PROMOCOES", "Promoções", "CENARIOS", "Cenários");

    private final NamedParameterJdbcTemplate jdbc;
    private final AiGate gate;
    private final AiPlatformConfig platform;
    private final WhatsAppConfigService config;
    private final CopilotSettingsService settings;
    private final DecisionService decisions;
    private final DailyBriefService briefs;
    private final AiUsageRecorder usage;
    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
    private final ObjectMapper mapper = new ObjectMapper();

    /** O que cada plano dá vem do catálogo (plan_features). */
    private com.pdv2cloud.service.billing.Entitlements entitlements;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setEntitlements(@org.springframework.context.annotation.Lazy com.pdv2cloud.service.billing.Entitlements entitlements) {
        this.entitlements = entitlements;
    }

    public WhatsAppChannel(NamedParameterJdbcTemplate jdbc, AiGate gate, AiPlatformConfig platform, WhatsAppConfigService config,
                           CopilotSettingsService settings, DecisionService decisions, DailyBriefService briefs,
                           AiUsageRecorder usage) {
        this.jdbc = jdbc;
        this.gate = gate;
        this.platform = platform;
        this.config = config;
        this.settings = settings;
        this.decisions = decisions;
        this.briefs = briefs;
        this.usage = usage;
    }

    public record Sent(boolean ok, String wamid, String error) {}

    // ── Saída ─────────────────────────────────────────────────────────────

    /** Rodada do job: resumo do dia (uma vez) e avisos novos, respeitando aceite e silêncio. */
    public int notify(UUID marketId) {
        CopilotSettingsService.Prefs prefs = settings.prefs(marketId);
        if (!prefs.whatsappOptIn() || prefs.whatsappPhone() == null) {
            return 0;
        }
        if (entitlements != null && !entitlements.has(marketId, "copilot_whatsapp")) {
            return 0;
        }
        LocalTime now = LocalTime.now(CopilotSettingsService.ZONE);
        if (CopilotSettingsService.quiet(prefs, now)) {
            return 0;
        }
        int sent = 0;
        if (!now.isBefore(BRIEF_FROM) && !sentToday(marketId, "RESUMO")) {
            DailyBriefService.Brief brief = briefs.today(marketId);
            String decisionId = brief.items().stream().filter(i -> "decisao".equals(i.get("tipo")))
                .map(i -> String.valueOf(i.get("id"))).findFirst().orElse(null);
            if (send(marketId, prefs.whatsappPhone(), "Resumo do dia. " + brief.text(),
                decisionId == null ? null : UUID.fromString(decisionId), "RESUMO").ok()) {
                sent++;
            } else {
                return sent;
            }
        }
        List<Map<String, Object>> pending = jdbc.queryForList(
            "select id, agent, title, body, impact, auto_executed, result::text as result from ai_decisions where market_id = :m "
                + "and (status in ('PENDENTE', 'INFORMATIVA') or (status = 'APROVADA' and auto_executed)) "
                + "and notified_at is null and created_at >= now() - interval '24 hours' order by urgent desc, created_at limit :n",
            new MapSqlParameterSource().addValue("m", marketId).addValue("n", MAX_PER_RUN));
        for (Map<String, Object> d : pending) {
            UUID id = (UUID) d.get("id");
            boolean alone = Boolean.TRUE.equals(d.get("auto_executed"));
            String agent = AGENT_LABEL.getOrDefault(String.valueOf(d.get("agent")), "Copiloto");
            String text = alone
                ? "Feito pelo Copiloto (" + agent + ", dentro dos seus limites): " + d.get("title") + ". " + autoSummary(String.valueOf(d.get("result")))
                    + " Para desfazer, abra o Copiloto em até 24 horas."
                : agent + ": " + d.get("title") + ". " + firstLines(String.valueOf(d.get("body")), 2);
            // Feito sozinho: os botões não aprovam nada (a decisão já foi executada).
            Sent s = send(marketId, prefs.whatsappPhone(), text, alone ? null : id, alone ? "FEITO" : "AVISO");
            if (!s.ok()) {
                break;
            }
            jdbc.update("update ai_decisions set notified_at = now() where market_id = :m and id = :id", Map.of("m", marketId, "id", id));
            sent++;
        }
        return sent;
    }

    /** Envia pelo modelo aprovado. Botões: Aprovar (payload com a decisão) e Depois. */
    Sent send(UUID marketId, String phone, String text, UUID decisionId, String kind) {
        AiGate.Decision g = gate.decide(marketId, TASK);
        if (!g.allowed()) {
            return new Sent(false, null, g.reason().name());
        }
        String phoneNumberId = g.key().defaultModel();
        if (phoneNumberId == null || phoneNumberId.isBlank()) {
            return new Sent(false, null, "ID do número não configurado");
        }
        Map<String, Object> template = new LinkedHashMap<>();
        template.put("name", config.templateName());
        template.put("language", Map.of("code", config.templateLang()));
        List<Object> components = new ArrayList<>();
        components.add(Map.of("type", "body", "parameters", List.of(Map.of("type", "text", "text", templateParam(text)))));
        String ref = decisionId == null ? "NENHUMA" : decisionId.toString();
        components.add(Map.of("type", "button", "sub_type", "quick_reply", "index", "0",
            "parameters", List.of(Map.of("type", "payload", "payload", "APROVAR:" + ref))));
        components.add(Map.of("type", "button", "sub_type", "quick_reply", "index", "1",
            "parameters", List.of(Map.of("type", "payload", "payload", "DEPOIS:" + ref))));
        template.put("components", components);
        Map<String, Object> body = Map.of("messaging_product", "whatsapp", "to", phone, "type", "template", "template", template);
        Sent s = post(g.key(), phoneNumberId, body);
        record(marketId, "OUT", phone, decisionId, kind, s);
        usage.recordFull(marketId, TASK, "WHATSAPP", config.templateName(), "canal-v1", null, 1, 0, 0,
            s.ok() ? AiUsageLog.Outcome.OK : AiUsageLog.Outcome.ERRO, s.error(), s.ok() ? AiGate.costUsd(g.route(), 1, 0) : 0d,
            "CANAL", 0, true);
        if (s.ok()) {
            gate.charge(marketId, g.route(), "whatsapp:" + kind.toLowerCase());
        }
        return s;
    }

    /** Resposta dentro da conversa (janela de 24 h aberta pelo lojista): texto livre, sem modelo. */
    Sent reply(UUID marketId, String phone, String text) {
        Optional<AiPlatformConfig.Key> key = platform.key("WHATSAPP");
        if (key.isEmpty() || key.get().defaultModel() == null) {
            return new Sent(false, null, "WhatsApp não configurado");
        }
        Sent s = post(key.get(), key.get().defaultModel(), Map.of("messaging_product", "whatsapp", "to", phone, "type", "text",
            "text", Map.of("body", text.length() > 4000 ? text.substring(0, 3999) + "…" : text)));
        record(marketId, "OUT", phone, null, "RESPOSTA", s);
        return s;
    }

    private Sent post(AiPlatformConfig.Key key, String phoneNumberId, Map<String, Object> body) {
        try {
            if (!phoneNumberId.matches("\\d{5,20}")) {
                return new Sent(false, null, "ID do número inválido");
            }
            HttpRequest req = HttpRequest.newBuilder(URI.create(key.baseUrl() + "/" + API_VERSION + "/" + phoneNumberId + "/messages"))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", "Bearer " + key.apiKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body), StandardCharsets.UTF_8))
                .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() < 200 || res.statusCode() >= 300) {
                String err = mapper.readTree(res.body()).path("error").path("message").asText("HTTP " + res.statusCode());
                return new Sent(false, null, err.length() > 280 ? err.substring(0, 280) : err);
            }
            return new Sent(true, mapper.readTree(res.body()).path("messages").path(0).path("id").asText(null), null);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Sent(false, null, "interrompido");
        } catch (Exception e) {
            log.warn("WhatsApp falhou: {}", e.getMessage());
            return new Sent(false, null, "falha de comunicação");
        }
    }

    // ── Entrada (webhook) ─────────────────────────────────────────────────

    /** Confere a assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo com o segredo do app). */
    public boolean validSignature(byte[] rawBody, String header) {
        String secret = config.appSecret();
        if (secret == null || header == null || !header.startsWith("sha256=")) {
            return false;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] expected = mac.doFinal(rawBody);
            byte[] got = HexFormat.of().parseHex(header.substring(7));
            return MessageDigest.isEqual(expected, got);
        } catch (Exception e) {
            return false;
        }
    }

    public boolean verifyToken(String token) {
        String expected = config.verifyToken();
        return expected != null && token != null
            && MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8));
    }

    /** Processa as mensagens recebidas (já com a assinatura conferida). */
    public int handleInbound(String rawBody) {
        JsonNode root;
        try {
            root = mapper.readTree(rawBody);
        } catch (Exception e) {
            return 0;
        }
        int handled = 0;
        for (JsonNode entry : root.path("entry")) {
            for (JsonNode change : entry.path("changes")) {
                for (JsonNode msg : change.path("value").path("messages")) {
                    String from = msg.path("from").asText("").replaceAll("\\D", "");
                    String type = msg.path("type").asText("");
                    String payload = switch (type) {
                        case "button" -> msg.path("button").path("payload").asText("");
                        case "interactive" -> msg.path("interactive").path("button_reply").path("id").asText("");
                        default -> null;
                    };
                    String text = "text".equals(type) ? msg.path("text").path("body").asText("") : null;
                    if (!from.isEmpty() && (payload != null || text != null)) {
                        TenantContext.runAsSystem(() -> {
                            inbound(from, payload, text);
                            return null;
                        });
                        handled++;
                    }
                }
            }
        }
        return handled;
    }

    void inbound(String from, String payload, String text) {
        List<UUID> markets = jdbc.queryForList("select market_id from ai_copilot_prefs where whatsapp_phone = :p",
            Map.of("p", from), UUID.class);
        if (markets.isEmpty()) {
            return;
        }
        List<UUID> optedIn = jdbc.queryForList("select market_id from ai_copilot_prefs where whatsapp_phone = :p and whatsapp_opt_in",
            Map.of("p", from), UUID.class);
        UUID logMarket = markets.get(0);
        record(logMarket, "IN", from, null, payload != null ? "BOTAO" : "TEXTO", new Sent(true, null, null));
        String normalized = text == null ? "" : java.text.Normalizer.normalize(text.toLowerCase().trim(), java.text.Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "");
        if (normalized.matches("(parar|pare|sair|cancelar|stop|descadastrar)\\W*")) {
            jdbc.update("update ai_copilot_prefs set whatsapp_opt_in = false, whatsapp_opt_in_at = null, updated_at = now(), "
                + "updated_by = 'whatsapp' where whatsapp_phone = :p", Map.of("p", from));
            reply(logMarket, from, "Pronto: você não vai mais receber avisos do MercadoFlow no WhatsApp. Para voltar, ative em Copiloto → Agentes.");
            return;
        }
        if (optedIn.isEmpty()) {
            return;
        }
        if (payload != null && payload.startsWith("DEPOIS:")) {
            reply(optedIn.get(0), from, "Combinado. Fica na caixa do Copiloto para quando você quiser ver.");
            return;
        }
        UUID decisionId = null;
        UUID market = null;
        if (payload != null && payload.startsWith("APROVAR:") && !payload.endsWith("NENHUMA")) {
            try {
                decisionId = UUID.fromString(payload.substring("APROVAR:".length()));
            } catch (IllegalArgumentException e) {
                return;
            }
            // A decisão tem de ser de um mercado deste número: o payload não basta.
            List<UUID> owner = jdbc.queryForList("select market_id from ai_decisions where id = :id", Map.of("id", decisionId), UUID.class);
            if (owner.isEmpty() || !optedIn.contains(owner.get(0))) {
                return;
            }
            market = owner.get(0);
        } else if (payload == null && normalized.matches("(aprova|aprovado|aprovo|sim|pode|pode fazer|ok)\\W*")) {
            if (optedIn.size() != 1) {
                reply(optedIn.get(0), from, "Você recebe avisos de mais de uma loja: toque em Aprovar no próprio aviso.");
                return;
            }
            market = optedIn.get(0);
            List<UUID> last = jdbc.queryForList("select id from ai_decisions where market_id = :m and status = 'PENDENTE' "
                + "and notified_at is not null order by notified_at desc limit 1", Map.of("m", market), UUID.class);
            if (last.isEmpty()) {
                reply(market, from, "Não há nada esperando a sua aprovação agora.");
                return;
            }
            decisionId = last.get(0);
        } else if (payload != null) {
            reply(optedIn.get(0), from, "Abra o Copiloto no MercadoFlow para ver os assuntos do dia.");
            return;
        } else {
            reply(optedIn.get(0), from, "Toque em Aprovar no aviso (ou responda \"aprova\"). Para não receber mais, responda PARAR.");
            return;
        }
        try {
            DecisionService.Decision d = decisions.approve(market, decisionId, "whatsapp:+" + from);
            reply(market, from, confirmation(d));
        } catch (IllegalStateException e) {
            reply(market, from, e.getMessage());
        } catch (java.util.NoSuchElementException e) {
            reply(market, from, "Não encontrei essa decisão.");
        }
    }

    static String confirmation(DecisionService.Decision d) {
        Map<String, Object> r = d.result() == null ? Map.of() : d.result();
        StringBuilder sb = new StringBuilder("Aprovado: ").append(d.title()).append('.');
        if (r.get("noPedido") instanceof Number n) {
            sb.append(' ').append(n.intValue()).append(n.intValue() == 1 ? " item foi" : " itens foram")
                .append(" para o rascunho de pedido. Revise no MercadoFlow antes de enviar ao fornecedor.");
        }
        if (r.get("mensagem") != null) {
            sb.append(" Mensagem para encaminhar ao fornecedor:\n\n").append(r.get("mensagem"));
        }
        if (!Boolean.TRUE.equals(r.get("executado"))) {
            sb.append(" Anotado na caixa do Copiloto.");
        }
        return sb.toString();
    }

    // ── Apoio ─────────────────────────────────────────────────────────────

    private boolean sentToday(UUID marketId, String kind) {
        Integer n = jdbc.queryForObject("select count(*) from ai_whatsapp_messages where market_id = :m and kind = :k "
                + "and direction = 'OUT' and status = 'ENVIADA' and created_at >= :d",
            new MapSqlParameterSource().addValue("m", marketId).addValue("k", kind)
                .addValue("d", java.sql.Timestamp.valueOf(LocalDate.now(CopilotSettingsService.ZONE).atStartOfDay())), Integer.class);
        return n != null && n > 0;
    }

    private void record(UUID marketId, String direction, String phone, UUID decisionId, String kind, Sent s) {
        jdbc.update("insert into ai_whatsapp_messages (market_id, direction, phone, decision_id, kind, status, wamid, error) "
                + "values (:m, :d, :p, :dec, :k, :s, :w, :e)",
            new MapSqlParameterSource().addValue("m", marketId).addValue("d", direction).addValue("p", phone)
                .addValue("dec", decisionId).addValue("k", kind)
                .addValue("s", "IN".equals(direction) ? "RECEBIDA" : s.ok() ? "ENVIADA" : "FALHOU")
                .addValue("w", s.wamid()).addValue("e", s.error()));
    }

    /** Parâmetro de modelo da Meta: sem quebra de linha, tabulação nem mais de 4 espaços seguidos; até 1024 caracteres. */
    static String templateParam(String text) {
        String t = text.replaceAll("[\\r\\n\\t]+", " ").replaceAll(" {2,}", " ").replace("•", "-").trim();
        return t.length() > 1024 ? t.substring(0, 1023) + "…" : t;
    }

    static String autoSummary(String resultJson) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"noPedido\"\\s*:\\s*(\\d+)").matcher(resultJson == null ? "" : resultJson);
        if (m.find()) {
            int n = Integer.parseInt(m.group(1));
            return n + (n == 1 ? " item foi" : " itens foram") + " para o rascunho de pedido.";
        }
        return "";
    }

    static String firstLines(String body, int n) {
        String[] lines = body.split("\\n");
        StringBuilder sb = new StringBuilder();
        for (int i = 0, used = 0; i < lines.length && used < n; i++) {
            if (!lines[i].isBlank()) {
                sb.append(used == 0 ? "" : " ").append(lines[i].trim());
                used++;
            }
        }
        return sb.toString();
    }
}
