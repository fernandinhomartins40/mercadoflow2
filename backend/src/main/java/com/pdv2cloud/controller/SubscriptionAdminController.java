package com.pdv2cloud.controller;

import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.MarketUsageCounter;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.SubscriptionEvent;
import com.pdv2cloud.service.SubscriptionAdminService;
import jakarta.validation.constraints.NotNull;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.Data;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Gestão de assinaturas do SaaS no painel do super admin.
 *
 * Complementa o SuperAdminController, que cuida de conteúdo (catálogo, crawler)
 * e de CRUD de usuários/mercados. Aqui fica tudo referente a plano, limites,
 * consumo e histórico de cobrança.
 */
@RestController
@RequestMapping("/api/v1/super-admin/subscriptions")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SubscriptionAdminController {

    private final SubscriptionAdminService subscriptionAdminService;

    public SubscriptionAdminController(SubscriptionAdminService subscriptionAdminService) {
        this.subscriptionAdminService = subscriptionAdminService;
    }

    /** Painel: métricas agregadas + planos + assinaturas + fila de upgrade. */
    @GetMapping("/overview")
    public ResponseEntity<Map<String, Object>> overview() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("metrics", subscriptionAdminService.metrics());
        response.put("plans", subscriptionAdminService.listPlans());
        response.put("subscriptions", subscriptionAdminService.listSubscriptions());
        response.put("upgradeCandidates", subscriptionAdminService.listUpgradeCandidates());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/plans")
    public ResponseEntity<List<SubscriptionAdminService.PlanDescriptor>> plans() {
        return ResponseEntity.ok(subscriptionAdminService.listPlans());
    }

    @GetMapping
    public ResponseEntity<List<SubscriptionAdminService.SubscriptionRow>> list() {
        return ResponseEntity.ok(subscriptionAdminService.listSubscriptions());
    }

    /** Contas gratuitas prestes a estourar (ou já estouradas) o limite. */
    @GetMapping("/upgrade-candidates")
    public ResponseEntity<List<SubscriptionAdminService.SubscriptionRow>> upgradeCandidates() {
        return ResponseEntity.ok(subscriptionAdminService.listUpgradeCandidates());
    }

    @GetMapping("/{marketId}/history")
    public ResponseEntity<List<SubscriptionEvent>> history(@PathVariable("marketId") UUID marketId) {
        return ResponseEntity.ok(subscriptionAdminService.historyFor(marketId));
    }

    @GetMapping("/{marketId}/usage")
    public ResponseEntity<List<MarketUsageCounter>> usage(@PathVariable("marketId") UUID marketId) {
        return ResponseEntity.ok(subscriptionAdminService.usageHistoryFor(marketId));
    }

    @PatchMapping("/{marketId}/plan")
    public ResponseEntity<SubscriptionAdminService.SubscriptionRow> changePlan(
        @PathVariable("marketId") UUID marketId,
        @RequestBody ChangePlanRequest request,
        Authentication authentication
    ) {
        return ResponseEntity.ok(subscriptionAdminService.changePlan(
            marketId, request.getPlan(), request.getReason(), authentication.getName()
        ));
    }

    @PatchMapping("/{marketId}/status")
    public ResponseEntity<SubscriptionAdminService.SubscriptionRow> changeStatus(
        @PathVariable("marketId") UUID marketId,
        @RequestBody ChangeStatusRequest request,
        Authentication authentication
    ) {
        return ResponseEntity.ok(subscriptionAdminService.changeStatus(
            marketId, request.getStatus(), request.getReason(), authentication.getName()
        ));
    }

    /** Limites negociados. Campos nulos restauram o padrão do plano. */
    @PatchMapping("/{marketId}/limits")
    public ResponseEntity<SubscriptionAdminService.SubscriptionRow> updateLimits(
        @PathVariable("marketId") UUID marketId,
        @RequestBody UpdateLimitsRequest request,
        Authentication authentication
    ) {
        return ResponseEntity.ok(subscriptionAdminService.updateLimits(
            marketId,
            request.getInvoiceLimit(),
            request.getPdvLimit(),
            request.getSeatLimit(),
            request.getUnlimited(),
            request.getReason(),
            authentication.getName()
        ));
    }

    @Data
    public static class ChangePlanRequest {
        @NotNull(message = "Informe o plano")
        private PlanType plan;
        private String reason;
    }

    @Data
    public static class ChangeStatusRequest {
        @NotNull(message = "Informe o status")
        private MarketBillingStatus status;
        private String reason;
    }

    @Data
    public static class UpdateLimitsRequest {
        private Integer invoiceLimit;
        private Integer pdvLimit;
        private Integer seatLimit;
        private Boolean unlimited;
        private String reason;
    }
}
