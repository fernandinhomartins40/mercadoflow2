package com.pdv2cloud.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.service.billing.AsaasService;
import com.pdv2cloud.service.billing.AsaasWebhookService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Avisos de pagamento do Asaas. A autenticidade vem do token que cadastramos
 * no Asaas (header asaas-access-token), conferido em tempo constante.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/public/asaas")
public class AsaasWebhookController {

    private static final Logger log = LoggerFactory.getLogger(AsaasWebhookController.class);

    private final AsaasService asaas;
    private final AsaasWebhookService webhooks;
    private final ObjectMapper json = new ObjectMapper();

    public AsaasWebhookController(AsaasService asaas, AsaasWebhookService webhooks) {
        this.asaas = asaas;
        this.webhooks = webhooks;
    }

    @PostMapping("/webhook")
    public ResponseEntity<Map<String, Object>> webhook(@RequestHeader(value = "asaas-access-token", required = false) String token,
                                                       @RequestBody String raw) {
        boolean valid = TenantContext.runAsSystem(() -> asaas.validToken(token));
        if (!valid) {
            return ResponseEntity.status(401).body(Map.of("error", "invalid_token"));
        }
        JsonNode body;
        try {
            body = json.readTree(raw);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid_body"));
        }
        try {
            AsaasWebhookService.Outcome outcome = TenantContext.runAsSystem(() -> webhooks.handle(body));
            return ResponseEntity.ok(Map.of("received", true, "outcome", outcome.name()));
        } catch (RuntimeException e) {
            // 500 faz o Asaas reenviar; o aviso não foi marcado como tratado se falhou antes.
            log.error("Falha ao tratar aviso do Asaas: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body(Map.of("error", "processing_failed"));
        }
    }
}
