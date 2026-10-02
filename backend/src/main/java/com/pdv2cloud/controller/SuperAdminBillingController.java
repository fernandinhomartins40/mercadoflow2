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
    private final com.pdv2cloud.service.billing.AsaasService asaas;
    private final com.pdv2cloud.service.billing.Entitlements entitlements;
    private final org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate jdbc;

    public SuperAdminBillingController(SubscriptionService subscriptions, com.pdv2cloud.service.billing.AsaasService asaas,
                                       com.pdv2cloud.service.billing.Entitlements entitlements,
                                       org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate jdbc) {
        this.subscriptions = subscriptions;
        this.asaas = asaas;
        this.entitlements = entitlements;
        this.jdbc = jdbc;
    }

    @org.springframework.beans.factory.annotation.Autowired
    private com.pdv2cloud.service.billing.BillingInsightsService insights;

    @org.springframework.beans.factory.annotation.Autowired
    private com.pdv2cloud.service.billing.NotificationService notices;

    @org.springframework.beans.factory.annotation.Autowired
    private com.pdv2cloud.service.SubscriptionAdminService subscriptionAdmin;

    @org.springframework.beans.factory.annotation.Autowired
    private com.pdv2cloud.service.ai.platform.AiWalletService wallets;

    @GetMapping("/revenue")
    public Map<String, Object> revenue() {
        return insights.revenue();
    }

    @GetMapping("/exceptions")
    public java.util.List<Map<String, Object>> exceptions(@org.springframework.web.bind.annotation.RequestParam(required = false) String status) {
        return insights.exceptions(status);
    }

    @PostMapping("/exceptions/{id}/resolve")
    public ResponseEntity<?> resolve(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body, Authentication auth) {
        try {
            insights.resolve(id, body == null || body.get("resolution") == null ? null : String.valueOf(body.get("resolution")), auth.getName());
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "exception", "userMessage", e.getMessage()));
        }
    }

    /** Ficha da conta: assinatura, eventos, pagamentos, avisos enviados, saídas e exceções. */
    @GetMapping("/accounts/{marketId}")
    public Map<String, Object> account(@PathVariable UUID marketId) {
        UUID root = subscriptions.rootOf(marketId);
        Map<String, Object> out = new java.util.LinkedHashMap<>(insights.account(root));
        out.put("subscription", SubscriptionController.view(subscriptions.of(root), subscriptions.settings(), java.time.LocalDateTime.now()));
        out.put("wallet", wallets.wallet(root));
        return out;
    }

    /** Ações rápidas, todas registradas no histórico com quem fez. */
    @PostMapping("/accounts/{marketId}/actions")
    public ResponseEntity<?> action(@PathVariable UUID marketId, @RequestBody Map<String, Object> body, Authentication auth) {
        UUID root = subscriptions.rootOf(marketId);
        String note = body.get("reason") == null || String.valueOf(body.get("reason")).isBlank() ? "" : " — " + body.get("reason");
        String who = "superadmin " + auth.getName();
        int days = body.get("days") instanceof Number n ? n.intValue() : 0;
        try {
            switch (String.valueOf(body.get("action"))) {
                case "EXTEND_TRIAL" -> subscriptions.extendTrial(root, days, "Teste prorrogado em " + days + " dia(s) por " + who + note);
                case "COURTESY" -> {
                    com.pdv2cloud.model.entity.PlanType plan = com.pdv2cloud.model.entity.PlanType.fromString(String.valueOf(body.get("plan")));
                    subscriptions.courtesy(root, plan, days, "Cortesia de " + days + " dia(s) no " + plan.getDisplayName() + " por " + who + note);
                }
                case "CREDITS" -> {
                    int credits = body.get("credits") instanceof Number n ? n.intValue() : 0;
                    if (credits < 1 || credits > 100_000) {
                        throw new IllegalArgumentException("Créditos de 1 a 100.000.");
                    }
                    wallets.credit(root, credits, "COURTESY", "superadmin", "Cortesia de " + credits + " créditos (" + who + ")" + note);
                }
                case "CHANGE_PLAN" -> subscriptionAdmin.changePlan(root,
                    com.pdv2cloud.model.entity.PlanType.fromString(String.valueOf(body.get("plan"))), "Troca sem cobrança" + note, auth.getName());
                default -> throw new IllegalArgumentException("Ação desconhecida");
            }
            return ResponseEntity.ok(account(root));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "action", "userMessage", e.getMessage()));
        }
    }

    @GetMapping("/templates")
    public java.util.List<com.pdv2cloud.service.billing.NotificationService.Template> templates() {
        return notices.templates();
    }

    @PutMapping("/templates/{kind}")
    public ResponseEntity<?> saveTemplate(@PathVariable String kind, @RequestBody Map<String, Object> body, Authentication auth) {
        try {
            return ResponseEntity.ok(notices.saveTemplate(kind, body, auth.getName()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "template", "userMessage", e.getMessage()));
        }
    }

    @GetMapping("/templates/{kind}/preview")
    public Map<String, String> preview(@PathVariable String kind) {
        return notices.preview(kind);
    }

    /** O que cada plano dá (a mesma tabela que a vitrine e o sistema leem). */
    @GetMapping("/features")
    public Map<String, Object> features() {
        return Map.of("definitions", entitlements.definitions(), "plans", entitlements.matrix(),
            "changes", jdbc.queryForList("select plan_code, feature_key, old_value, new_value, actor, created_at "
                + "from plan_feature_changes order by created_at desc limit 30", Map.of()));
    }

    /** Muda um recurso de um plano; vale para todos os assinantes do plano. */
    @PutMapping("/features/{plan}/{feature}")
    public ResponseEntity<?> saveFeature(@PathVariable String plan, @PathVariable String feature,
                                         @RequestBody Map<String, Object> body, Authentication auth) {
        try {
            Boolean enabled = body.get("enabled") instanceof Boolean b ? b : null;
            Integer amount = body.get("amount") instanceof Number n ? n.intValue() : null;
            return ResponseEntity.ok(entitlements.save(plan, feature, enabled, amount, auth.getName()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "feature", "userMessage", e.getMessage()));
        }
    }

    @GetMapping("/addons")
    public java.util.List<Map<String, Object>> addonCatalog() {
        return jdbc.queryForList("select * from addon_catalog order by code", Map.of());
    }

    @PutMapping("/addons/{code}")
    public ResponseEntity<?> saveAddon(@PathVariable String code, @RequestBody Map<String, Object> body) {
        int price = body.get("monthlyPriceCents") instanceof Number n ? n.intValue() : -1;
        if (price < 0 || price > 10_000_000) {
            return ResponseEntity.badRequest().body(Map.of("error", "addon", "userMessage", "Preço inválido"));
        }
        Boolean active = body.get("active") instanceof Boolean b ? b : null;
        int n = jdbc.update("update addon_catalog set monthly_price_cents = :p, active = coalesce(:a, active) where code = :c",
            new org.springframework.jdbc.core.namedparam.MapSqlParameterSource().addValue("p", price).addValue("a", active).addValue("c", code));
        return n == 0 ? ResponseEntity.badRequest().body(Map.of("error", "addon", "userMessage", "Adicional desconhecido"))
            : ResponseEntity.ok(addonCatalog());
    }

    /** Por que as contas cancelaram ou pausaram. */
    @GetMapping("/exits")
    public java.util.List<Map<String, Object>> exits() {
        return jdbc.queryForList("select f.reason, f.comment, f.outcome, f.actor, f.created_at, m.name as market_name "
            + "from subscription_cancel_feedback f join markets m on m.id = f.market_id order by f.created_at desc limit 100", Map.of());
    }

    /** Situação do Asaas e da nota fiscal automática. */
    @GetMapping("/asaas")
    public Map<String, Object> asaasStatus() {
        return asaas.adminStatus();
    }

    /** Cadastra no Asaas o aviso de pagamento com um token novo. */
    @PostMapping("/asaas/webhook")
    public ResponseEntity<?> registerWebhook(@RequestBody(required = false) Map<String, Object> body) {
        try {
            String email = body == null || body.get("email") == null ? null : String.valueOf(body.get("email"));
            return ResponseEntity.ok(Map.of("url", asaas.registerWebhook(email)));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "asaas_webhook", "userMessage", e.getMessage()));
        }
    }

    @PutMapping("/invoice-settings")
    public ResponseEntity<?> saveInvoiceSettings(@RequestBody Map<String, Object> body) {
        try {
            return ResponseEntity.ok(asaas.saveInvoiceSettings(body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid_settings", "userMessage", e.getMessage()));
        }
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
