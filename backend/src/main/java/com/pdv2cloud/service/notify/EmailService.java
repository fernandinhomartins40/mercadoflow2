package com.pdv2cloud.service.notify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.service.ai.LlmClient;
import com.pdv2cloud.service.ai.platform.AiPlatformConfig;
import com.pdv2cloud.service.ai.AiCredentialCipher;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * E-mail transacional da plataforma (VeloMail, API HTTP — sem biblioteca nova).
 * A chave e o remetente ficam no painel IA e APIs → Chaves e canais (provedor
 * EMAIL), cifrados como as outras chaves.
 *
 * Sem chave configurada, nada quebra: o envio devolve falso e quem chamou
 * decide (o "esqueci a senha" responde igual, para não revelar contas).
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private static final Pattern NAMED_SENDER = Pattern.compile("^\\s*(.*?)\\s*<([^>]+)>\\s*$");
    /** Endereço público fixo: a imagem precisa abrir na caixa de entrada de qualquer pessoa. */
    private static final String LOGO_URL = "https://mercadoflow.com/logomercadoflow-branco.png";

    /** Tom do e-mail: cor da etiqueta e da barra da observação (paleta do painel). */
    public enum Tone {
        NEUTRAL("#F4FBDD", "#142400", "#C9EA45"),
        SUCCESS("#E7F5EC", "#0F6332", "#157A3D"),
        WARNING("#FEF3C7", "#92400E", "#D97706"),
        DANGER("#FEE2E2", "#991B1B", "#DC2626"),
        SECURITY("#E4EDE6", "#0F3A29", "#0F3A29");

        final String soft;
        final String ink;
        final String bar;

        Tone(String soft, String ink, String bar) {
            this.soft = soft;
            this.ink = ink;
            this.bar = bar;
        }
    }

    /** Etiqueta acima do título, tom e observação no fim do corpo (ambas opcionais). */
    public record Look(String kicker, Tone tone, String note) {
        public static final Look DEFAULT = new Look(null, Tone.NEUTRAL, null);
    }

    private final AiPlatformConfig platform;
    private final AiCredentialCipher cipher;
    private final NamedParameterJdbcTemplate jdbc;
    private final String publicBaseUrl;
    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
    private final ObjectMapper mapper = new ObjectMapper();

    public EmailService(AiPlatformConfig platform, AiCredentialCipher cipher, NamedParameterJdbcTemplate jdbc,
                        @Value("${app.public-base-url:https://mercadoflow.com}") String publicBaseUrl) {
        this.platform = platform;
        this.cipher = cipher;
        this.jdbc = jdbc;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
    }

    public record Sent(boolean ok, String id, String error) {}

    public boolean configured() {
        return platform.key("EMAIL").isPresent();
    }

    public String link(String path) {
        return publicBaseUrl + (path.startsWith("/") ? path : "/" + path);
    }

    /** Envia com o visual padrão. */
    public Sent send(String to, String subject, String title, List<String> paragraphs, String buttonLabel, String buttonUrl) {
        return send(to, subject, title, paragraphs, buttonLabel, buttonUrl, Look.DEFAULT);
    }

    /** Envia um e-mail com o corpo em texto e o mesmo conteúdo em HTML, no visual da marca. */
    public Sent send(String to, String subject, String title, List<String> paragraphs, String buttonLabel, String buttonUrl, Look look) {
        Optional<AiPlatformConfig.Key> key = platform.key("EMAIL");
        if (key.isEmpty()) {
            return new Sent(false, null, "E-mail não configurado");
        }
        String sender = key.get().defaultModel() == null || key.get().defaultModel().isBlank()
            ? "MercadoFlow <nao-responda@mercadoflow.com>" : key.get().defaultModel();
        Map<String, Object> body = new LinkedHashMap<>();
        // O VeloMail recusa "Nome <email>" no from: o nome vai em from_name.
        Matcher named = NAMED_SENDER.matcher(sender);
        if (named.matches()) {
            body.put("from", named.group(2).trim());
            if (!named.group(1).isBlank()) body.put("from_name", named.group(1).trim());
        } else {
            body.put("from", sender.trim());
        }
        body.put("to", to);
        body.put("subject", subject);
        body.put("html", html(title, paragraphs, buttonLabel, buttonUrl, look));
        body.put("text", text(title, paragraphs, buttonLabel, buttonUrl, look));
        // Link com token não pode passar por redirecionador de clique.
        body.put("tracking_enabled", false);
        String json;
        try {
            json = mapper.writeValueAsString(body);
        } catch (Exception e) {
            return new Sent(false, null, "falha ao montar o e-mail");
        }
        Attempt attempt = deliver(key.get(), json);
        if (attempt.ok()) {
            record(to, subject, "sent", attempt.id(), null, null);
            return new Sent(true, attempt.id(), null);
        }
        if (attempt.retry() && record(to, subject, "queued", null, attempt.error(), cipher.encrypt(json))) {
            // Vai sair na próxima tentativa (EmailQueueJob): para quem chamou, está encaminhado.
            log.info("E-mail na fila para nova tentativa: {}", attempt.error());
            return new Sent(true, null, null);
        }
        record(to, subject, "failed", null, attempt.error(), null);
        return new Sent(false, null, attempt.error());
    }

    private record Attempt(boolean ok, boolean retry, String id, String error) {}

    private Attempt deliver(AiPlatformConfig.Key key, String json) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(key.baseUrl() + "/emails/send"))
                .timeout(Duration.ofSeconds(15))
                .header("x-api-key", key.apiKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                return new Attempt(true, false, mapper.readTree(res.body()).path("message_id").asText(null), null);
            }
            String why = LlmClient.providerReason(res.body());
            log.warn("E-mail recusado ({}): {}", res.statusCode(), why);
            return new Attempt(false, retryable(res.statusCode()), null, "HTTP " + res.statusCode() + (why == null ? "" : ": " + why));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Attempt(false, true, null, "interrompido");
        } catch (Exception e) {
            log.warn("E-mail falhou: {}", e.getMessage());
            return new Attempt(false, true, null, "falha de comunicação");
        }
    }

    /** Limite do plano e instabilidade passam; os outros erros (remetente, endereço, chave) não adianta repetir. */
    static boolean retryable(int status) {
        return status == 429 || status >= 500;
    }

    /** Histórico nunca atrapalha o envio. */
    private boolean record(String to, String subject, String status, String messageId, String error, String payload) {
        try {
            jdbc.update("insert into email_messages (message_id, recipient, subject, status, error, payload, next_attempt_at) "
                    + "values (:m, :t, :s, :st, :e, :p, case when :st = 'queued' then now() + interval '1 minute' end)",
                new MapSqlParameterSource().addValue("m", messageId).addValue("t", cut(to, 320)).addValue("s", cut(subject, 300))
                    .addValue("st", status).addValue("e", cut(error, 500)).addValue("p", payload));
            return true;
        } catch (RuntimeException e) {
            log.warn("Histórico de e-mail não gravado: {}", e.getMessage());
            return false;
        }
    }

    private static String cut(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    /**
     * Tenta de novo os e-mails da fila, poucos por vez, para respeitar o
     * limite do plano do VeloMail. Se ele recusar de novo, para e espera a próxima rodada.
     */
    public void flushQueue() {
        Optional<AiPlatformConfig.Key> key = platform.key("EMAIL");
        if (key.isEmpty()) {
            return;
        }
        List<Map<String, Object>> due = jdbc.queryForList("select id, payload, attempts, created_at < now() - interval '24 hours' as stale "
            + "from email_messages where status = 'queued' and next_attempt_at <= now() order by created_at limit 2", Map.of());
        for (Map<String, Object> row : due) {
            Object id = row.get("id");
            if (Boolean.TRUE.equals(row.get("stale"))) {
                jdbc.update("update email_messages set status = 'failed', error = 'Sem envio em 24 horas', payload = null, updated_at = now() where id = :id", Map.of("id", id));
                continue;
            }
            Attempt attempt = deliver(key.get(), cipher.decrypt((String) row.get("payload")));
            if (attempt.ok()) {
                jdbc.update("update email_messages set status = 'sent', message_id = :m, error = null, payload = null, updated_at = now() where id = :id",
                    new MapSqlParameterSource().addValue("m", attempt.id()).addValue("id", id));
            } else if (attempt.retry()) {
                int attempts = ((Number) row.get("attempts")).intValue() + 1;
                jdbc.update("update email_messages set attempts = :a, error = :e, updated_at = now(), "
                        + "next_attempt_at = now() + make_interval(mins => :w) where id = :id",
                    new MapSqlParameterSource().addValue("a", attempts).addValue("e", cut(attempt.error(), 500))
                        .addValue("w", Math.min(attempts, 30)).addValue("id", id));
                return;
            } else {
                jdbc.update("update email_messages set status = 'failed', error = :e, payload = null, updated_at = now() where id = :id",
                    new MapSqlParameterSource().addValue("e", cut(attempt.error(), 500)).addValue("id", id));
            }
        }
    }

    // ── Webhooks de entrega ────────────────────────────────────────────────

    /** Segredo cadastrado no VeloMail: derivado da chave mestra, nada novo para guardar. */
    public String webhookSecret() {
        return cipher.isConfigured() ? cipher.derive("velomail-webhook") : null;
    }

    public boolean validWebhookSignature(String raw, String header) {
        return validSignature(raw, header, webhookSecret());
    }

    static boolean validSignature(String raw, String header, String secret) {
        if (secret == null || raw == null || header == null || !header.startsWith("sha256=")) {
            return false;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String expected = HexFormat.of().formatHex(mac.doFinal(raw.getBytes(StandardCharsets.UTF_8)));
            return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), header.substring(7).trim().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return false;
        }
    }

    /** Atualiza o status. Aviso repetido ou fora de ordem não desfaz "entregue" nem "falhou". */
    public void applyDeliveryEvent(String event, String messageId, String error) {
        if (messageId == null || messageId.isBlank()) {
            return;
        }
        String sql = switch (event) {
            case "email.delivered" -> "update email_messages set status = 'delivered', updated_at = now() where message_id = :m and status <> 'failed'";
            case "email.failed" -> "update email_messages set status = 'failed', error = :e, updated_at = now() where message_id = :m and status <> 'delivered'";
            default -> null;
        };
        if (sql == null) {
            return;
        }
        int changed = jdbc.update(sql, new MapSqlParameterSource().addValue("m", messageId).addValue("e", cut(error, 500)));
        if (changed > 0 && event.equals("email.failed")) {
            log.warn("VeloMail não entregou o e-mail {}: {}", messageId, error);
        }
    }

    /** Painel: os últimos envios e o total de 7 dias por situação. */
    public Map<String, Object> recent() {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> totals = new LinkedHashMap<>();
        jdbc.queryForList("select status, count(*) as total from email_messages where created_at > now() - interval '7 days' group by status", Map.of())
            .forEach((r) -> totals.put((String) r.get("status"), r.get("total")));
        out.put("totals", totals);
        out.put("rows", jdbc.queryForList("select recipient, subject, status, error, attempts, created_at as \"createdAt\" "
            + "from email_messages order by created_at desc limit 30", Map.of()));
        return out;
    }

    static String html(String title, List<String> paragraphs, String buttonLabel, String buttonUrl) {
        return html(title, paragraphs, buttonLabel, buttonUrl, Look.DEFAULT);
    }

    /**
     * Layout único de todos os e-mails, com as cores do painel (flow-core.css).
     * Tabelas e estilo na linha: é o que Gmail e Outlook respeitam.
     */
    static String html(String title, List<String> paragraphs, String buttonLabel, String buttonUrl, Look look) {
        Tone tone = look.tone();
        String preview = paragraphs.isEmpty() ? title : paragraphs.get(0);
        StringBuilder sb = new StringBuilder("<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\">")
            .append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
            .append("<meta name=\"color-scheme\" content=\"light\"><meta name=\"supported-color-schemes\" content=\"light\">")
            .append("<title>").append(esc(title)).append("</title></head>")
            .append("<body style=\"margin:0;padding:0;background:#EEF3EF;\">")
            // Texto que o leitor de e-mail mostra ao lado do assunto.
            .append("<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:#EEF3EF;\">").append(esc(preview)).append("</div>")
            .append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#EEF3EF;\"><tr><td align=\"center\" style=\"padding:24px 12px;\">")
            .append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"max-width:600px;border-collapse:separate;\">")
            // Topo: logo real sobre o verde-floresta, com a faixa lima da marca.
            .append("<tr><td style=\"background:#0F3A29;padding:22px 32px;border-radius:16px 16px 0 0;\">")
            .append("<a href=\"https://mercadoflow.com\" style=\"text-decoration:none;\"><img src=\"").append(LOGO_URL)
            .append("\" width=\"184\" height=\"35\" alt=\"MercadoFlow\" style=\"display:block;border:0;width:184px;height:35px;color:#F2F8F3;font:bold 20px Arial,sans-serif;\"></a></td></tr>")
            .append("<tr><td style=\"background:#D7F26B;height:4px;line-height:4px;font-size:4px;\">&nbsp;</td></tr>")
            .append("<tr><td style=\"background:#FFFFFF;padding:32px;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0B1F16;\">");
        if (look.kicker() != null) {
            sb.append("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td style=\"background:").append(tone.soft)
                .append(";color:").append(tone.ink).append(";font-size:12px;font-weight:bold;letter-spacing:.3px;padding:5px 12px;border-radius:999px;\">")
                .append(esc(look.kicker())).append("</td></tr></table>");
        }
        sb.append("<h1 style=\"margin:14px 0 16px;font-size:24px;line-height:1.25;font-weight:800;color:#0B1F16;\">").append(esc(title)).append("</h1>");
        for (String p : paragraphs) {
            sb.append("<p style=\"margin:0 0 14px;font-size:16px;line-height:1.55;color:#2F4339;\">").append(esc(p)).append("</p>");
        }
        if (buttonLabel != null && buttonUrl != null) {
            sb.append("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:22px 0 8px;\"><tr><td bgcolor=\"#0F3A29\" style=\"background:#0F3A29;border-radius:10px;\">")
                .append("<a href=\"").append(esc(buttonUrl)).append("\" style=\"display:inline-block;padding:14px 26px;color:#FFFFFF;font-size:16px;font-weight:bold;text-decoration:none;border-radius:10px;\">")
                .append(esc(buttonLabel)).append("</a></td></tr></table>")
                .append("<p style=\"margin:12px 0 0;font-size:12px;line-height:1.5;color:#5F7067;word-break:break-all;\">Se o botão não abrir, copie este endereço: ")
                .append(esc(buttonUrl)).append("</p>");
        }
        if (look.note() != null) {
            sb.append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin-top:22px;\"><tr><td style=\"background:#F6F9F6;border-left:4px solid ")
                .append(tone.bar).append(";padding:12px 14px;font-size:14px;line-height:1.5;color:#2F4339;border-radius:0 8px 8px 0;\">")
                .append(esc(look.note())).append("</td></tr></table>");
        }
        return sb.append("</td></tr>")
            .append("<tr><td style=\"background:#F6F9F6;padding:18px 32px;border-top:1px solid #E1E8E2;border-radius:0 0 16px 16px;font-family:Inter,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.5;color:#5F7067;\">")
            .append("E-mail automático do <a href=\"https://mercadoflow.com\" style=\"color:#157A3D;font-weight:bold;text-decoration:none;\">MercadoFlow</a>. Não é preciso responder.")
            .append("</td></tr></table></td></tr></table></body></html>")
            .toString();
    }

    static String text(String title, List<String> paragraphs, String buttonLabel, String buttonUrl, Look look) {
        String base = text(title, paragraphs, buttonLabel, buttonUrl);
        return look.note() == null ? base : base.replace("\nMercadoFlow", look.note() + "\n\nMercadoFlow");
    }

    static String text(String title, List<String> paragraphs, String buttonLabel, String buttonUrl) {
        StringBuilder sb = new StringBuilder(title).append("\n\n");
        paragraphs.forEach(p -> sb.append(p).append("\n\n"));
        if (buttonLabel != null && buttonUrl != null) {
            sb.append(buttonLabel).append(": ").append(buttonUrl).append('\n');
        }
        return sb.append("\nMercadoFlow").toString();
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
