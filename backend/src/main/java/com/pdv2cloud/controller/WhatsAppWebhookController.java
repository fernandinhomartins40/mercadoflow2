package com.pdv2cloud.controller;

import com.pdv2cloud.service.ai.agents.WhatsAppChannel;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Webhook do WhatsApp (Meta). Público porque quem chama é a Meta, sem JWT: a
 * verificação usa o token cadastrado no superadmin, e cada mensagem só é
 * aceita com a assinatura HMAC do corpo (segredo do app).
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/public/whatsapp/webhook")
public class WhatsAppWebhookController {

    private final WhatsAppChannel channel;

    public WhatsAppWebhookController(WhatsAppChannel channel) {
        this.channel = channel;
    }

    @GetMapping
    public ResponseEntity<String> verify(@RequestParam(name = "hub.mode", required = false) String mode,
                                         @RequestParam(name = "hub.verify_token", required = false) String token,
                                         @RequestParam(name = "hub.challenge", required = false) String challenge) {
        if ("subscribe".equals(mode) && challenge != null && channel.verifyToken(token)) {
            return ResponseEntity.ok(challenge);
        }
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @PostMapping
    public ResponseEntity<Void> receive(@RequestBody byte[] raw,
                                        @RequestHeader(name = "X-Hub-Signature-256", required = false) String signature) {
        // A assinatura vale sobre os bytes exatamente como chegaram.
        if (raw.length > 256_000 || !channel.validSignature(raw, signature)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        channel.handleInbound(new String(raw, java.nio.charset.StandardCharsets.UTF_8));
        return ResponseEntity.ok().build();
    }
}
