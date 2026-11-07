package com.pdv2cloud.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.service.notify.EmailService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Avisos de entrega do VeloMail. A assinatura é conferida sobre o corpo exato recebido. */
@RestController
@RequestMapping("/api/v1/public/velomail")
public class VeloMailWebhookController {

    private final EmailService email;
    private final ObjectMapper json = new ObjectMapper();

    public VeloMailWebhookController(EmailService email) {
        this.email = email;
    }

    @PostMapping("/webhook")
    public ResponseEntity<Map<String, Object>> webhook(@RequestHeader(value = "X-Webhook-Signature", required = false) String signature,
                                                       @RequestBody String raw) {
        if (!email.validWebhookSignature(raw, signature)) {
            return ResponseEntity.status(401).body(Map.of("error", "invalid_signature"));
        }
        JsonNode body;
        try {
            body = json.readTree(raw);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid_body"));
        }
        JsonNode data = body.path("data");
        TenantContext.runAsSystem(() -> email.applyDeliveryEvent(body.path("event").asText(""),
            data.path("message_id").asText(""), data.path("error_message").asText(null)));
        return ResponseEntity.ok(Map.of("received", true));
    }
}
