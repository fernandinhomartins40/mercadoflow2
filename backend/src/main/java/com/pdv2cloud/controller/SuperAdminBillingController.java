package com.pdv2cloud.controller;

import com.pdv2cloud.service.billing.SubscriptionService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Regras do ciclo das assinaturas (teste, carência, restrição) e execução manual do ciclo. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/super-admin/billing")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SuperAdminBillingController {

    private final SubscriptionService subscriptions;

    public SuperAdminBillingController(SubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    @GetMapping("/settings")
    public SubscriptionService.Settings settings() {
        return subscriptions.settings();
    }

    @PutMapping("/settings")
    public ResponseEntity<?> save(@RequestBody Map<String, Object> body, Authentication auth) {
        try {
            return ResponseEntity.ok(subscriptions.saveSettings(body, auth.getName()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid_settings", "userMessage", e.getMessage()));
        }
    }

    /** Roda o ciclo diário agora (o job roda às 8h15). */
    @PostMapping("/lifecycle/run")
    public SubscriptionService.LifecycleResult runLifecycle() {
        return TenantContext.runAsSystem(subscriptions::runLifecycle);
    }

    @GetMapping("/subscriptions/{marketId}")
    public SubscriptionService.Subscription subscription(@PathVariable UUID marketId) {
        return subscriptions.of(marketId);
    }
}
