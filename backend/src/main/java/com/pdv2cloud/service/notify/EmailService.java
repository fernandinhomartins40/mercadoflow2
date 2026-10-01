package com.pdv2cloud.service.notify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.service.ai.LlmClient;
import com.pdv2cloud.service.ai.platform.AiPlatformConfig;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * E-mail transacional da plataforma (Resend, API HTTP — sem biblioteca nova).
 * A chave e o remetente ficam no painel IA e APIs → Chaves e canais (provedor
 * EMAIL), cifrados como as outras chaves.
 *
 * Sem chave configurada, nada quebra: o envio devolve falso e quem chamou
 * decide (o "esqueci a senha" responde igual, para não revelar contas).
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final AiPlatformConfig platform;
    private final String publicBaseUrl;
    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
    private final ObjectMapper mapper = new ObjectMapper();

    public EmailService(AiPlatformConfig platform, @Value("${app.public-base-url:https://mercadoflow.com}") String publicBaseUrl) {
        this.platform = platform;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
    }

    public record Sent(boolean ok, String id, String error) {}

    public boolean configured() {
        return platform.key("EMAIL").isPresent();
    }

    public String link(String path) {
        return publicBaseUrl + (path.startsWith("/") ? path : "/" + path);
    }

    /** Envia um e-mail com o corpo em texto e o mesmo conteúdo em HTML simples. */
    public Sent send(String to, String subject, String title, List<String> paragraphs, String buttonLabel, String buttonUrl) {
        Optional<AiPlatformConfig.Key> key = platform.key("EMAIL");
        if (key.isEmpty()) {
            return new Sent(false, null, "E-mail não configurado");
        }
        String from = key.get().defaultModel() == null || key.get().defaultModel().isBlank()
            ? "MercadoFlow <nao-responda@mercadoflow.com>" : key.get().defaultModel();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("from", from);
        body.put("to", List.of(to));
        body.put("subject", subject);
        body.put("html", html(title, paragraphs, buttonLabel, buttonUrl));
        body.put("text", text(title, paragraphs, buttonLabel, buttonUrl));
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(key.get().baseUrl() + "/emails"))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", "Bearer " + key.get().apiKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body), StandardCharsets.UTF_8))
                .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                return new Sent(true, mapper.readTree(res.body()).path("id").asText(null), null);
            }
            String why = LlmClient.providerReason(res.body());
            log.warn("E-mail recusado ({}): {}", res.statusCode(), why);
            return new Sent(false, null, "HTTP " + res.statusCode() + (why == null ? "" : ": " + why));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Sent(false, null, "interrompido");
        } catch (Exception e) {
            log.warn("E-mail falhou: {}", e.getMessage());
            return new Sent(false, null, "falha de comunicação");
        }
    }

    static String html(String title, List<String> paragraphs, String buttonLabel, String buttonUrl) {
        StringBuilder sb = new StringBuilder("<div style=\"font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f1a14\">")
            .append("<p style=\"font-weight:bold;color:#0a7a3d;font-size:15px\">MercadoFlow</p>")
            .append("<h1 style=\"font-size:20px\">").append(esc(title)).append("</h1>");
        for (String p : paragraphs) {
            sb.append("<p style=\"font-size:15px;line-height:1.5\">").append(esc(p)).append("</p>");
        }
        if (buttonLabel != null && buttonUrl != null) {
            sb.append("<p><a href=\"").append(esc(buttonUrl)).append("\" style=\"display:inline-block;background:#0a7a3d;color:#fff;")
                .append("padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold\">").append(esc(buttonLabel)).append("</a></p>")
                .append("<p style=\"font-size:12px;color:#5b6b62\">Se o botão não abrir, copie este endereço: ").append(esc(buttonUrl)).append("</p>");
        }
        return sb.append("</div>").toString();
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
