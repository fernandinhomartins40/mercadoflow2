package com.pdv2cloud.controller;

import com.pdv2cloud.service.ai.platform.AiPlatformConfig;
import com.pdv2cloud.service.ai.platform.AiPlatformReports;
import com.pdv2cloud.service.ai.platform.AiWalletService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Painel "IA e APIs" do superadmin: chaves, roteamento, orçamento, piloto, console e uso. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/super-admin/ai")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SuperAdminAiController {

    private final AiPlatformConfig config;
    private final AiWalletService wallets;
    private final AiPlatformReports reports;

    public SuperAdminAiController(AiPlatformConfig config, AiWalletService wallets, AiPlatformReports reports) {
        this.config = config;
        this.wallets = wallets;
        this.reports = reports;
    }

    @GetMapping("/overview")
    public Map<String, Object> overview() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("settings", config.settings());
        out.put("providers", config.providers());
        out.put("routes", config.routes());
        out.put("pilots", config.pilots());
        out.put("plans", wallets.plans(false));
        return out;
    }

    @PutMapping("/settings")
    public AiPlatformConfig.Settings saveSettings(@RequestBody Map<String, Object> body, Authentication auth) {
        return config.saveSettings(body, auth.getName());
    }

    @PutMapping("/providers/{provider}")
    public List<AiPlatformConfig.Provider> saveProvider(@PathVariable String provider, @RequestBody Map<String, Object> body,
                                                        Authentication auth) {
        return config.saveProvider(provider, str(body.get("apiKey")), str(body.get("baseUrl")), str(body.get("model")),
            body.get("enabled") == null ? null : Boolean.valueOf(String.valueOf(body.get("enabled"))),
            body.get("priority") instanceof Number n ? n.intValue() : null, auth.getName());
    }

    @DeleteMapping("/providers/{provider}/key")
    public List<AiPlatformConfig.Provider> removeKey(@PathVariable String provider, Authentication auth) {
        return config.removeKey(provider, auth.getName());
    }

    @PostMapping("/providers/{provider}/test")
    public AiPlatformConfig.TestResult test(@PathVariable String provider, Authentication auth) {
        return config.test(provider, auth.getName());
    }

    @PutMapping("/routes/{task}")
    public List<AiPlatformConfig.Route> saveRoute(@PathVariable String task, @RequestBody Map<String, Object> body,
                                                  Authentication auth) {
        return config.saveRoute(task, body, auth.getName());
    }

    @GetMapping("/markets")
    public List<AiPlatformConfig.MarketHit> markets(@RequestParam(required = false) String q) {
        return config.searchMarkets(q);
    }

    /** Entra na lista de teste e ganha os créditos de teste (uma vez). */
    @PostMapping("/pilots")
    public List<AiPlatformConfig.PilotMarket> addPilot(@RequestBody Map<String, Object> body, Authentication auth) {
        UUID marketId = UUID.fromString(String.valueOf(body.get("marketId")));
        if (config.addPilot(marketId, auth.getName())) {
            int grant = config.settings().pilotGrantCredits();
            if (grant > 0) {
                wallets.credit(marketId, grant, "GRANT", "piloto", grant + " créditos de teste da IA");
            }
        }
        return config.pilots();
    }

    @DeleteMapping("/pilots/{marketId}")
    public List<AiPlatformConfig.PilotMarket> removePilot(@PathVariable UUID marketId, Authentication auth) {
        config.removePilot(marketId, auth.getName());
        return config.pilots();
    }

    @GetMapping("/wallets/{marketId}")
    public Map<String, Object> wallet(@PathVariable UUID marketId) {
        return Map.of("wallet", wallets.wallet(marketId), "ledger", wallets.ledger(marketId));
    }

    @PostMapping("/wallets/{marketId}/adjust")
    public AiWalletService.Wallet adjust(@PathVariable UUID marketId, @RequestBody Map<String, Object> body, Authentication auth) {
        int delta = body.get("delta") instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(body.get("delta")));
        String note = str(body.get("note"));
        AiWalletService.Wallet w = wallets.credit(marketId, delta, "ADJUST", auth.getName(),
            note == null ? "Ajuste manual" : note);
        config.audit(auth.getName(), "WALLET_ADJUST", marketId + " " + delta);
        return w;
    }

    @PutMapping("/wallets/{marketId}/cap")
    public AiWalletService.Wallet cap(@PathVariable UUID marketId, @RequestBody Map<String, Object> body, Authentication auth) {
        Integer cap = body.get("monthlyCap") == null || String.valueOf(body.get("monthlyCap")).isBlank() ? null
            : Integer.valueOf(String.valueOf(body.get("monthlyCap")));
        config.audit(auth.getName(), "WALLET_CAP", marketId + " " + cap);
        return wallets.setMonthlyCap(marketId, cap);
    }

    @PutMapping("/plans")
    public List<AiWalletService.Plan> savePlan(@RequestBody Map<String, Object> body, Authentication auth) {
        config.audit(auth.getName(), "PLAN_SAVE", String.valueOf(body.get("name")));
        return wallets.savePlan(body.get("id") == null ? null : UUID.fromString(String.valueOf(body.get("id"))),
            str(body.get("name")), ((Number) body.get("credits")).intValue(), ((Number) body.get("priceCents")).intValue(),
            !Boolean.FALSE.equals(body.get("active")), body.get("sortOrder") instanceof Number n ? n.intValue() : 0);
    }

    @GetMapping("/orders")
    public List<AiWalletService.Order> orders(@RequestParam(required = false) String status) {
        return wallets.allOrders(status);
    }

    @PostMapping("/orders/{id}/confirm")
    public Map<String, Object> confirm(@PathVariable UUID id, Authentication auth) {
        wallets.markPaid(id, auth.getName());
        config.audit(auth.getName(), "ORDER_CONFIRM", id.toString());
        return Map.of("ok", true);
    }

    @PostMapping("/orders/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable UUID id, Authentication auth) {
        wallets.cancel(id);
        config.audit(auth.getName(), "ORDER_CANCEL", id.toString());
        return Map.of("ok", true);
    }

    @GetMapping("/usage")
    public Map<String, Object> usage(@RequestParam(defaultValue = "30") int days) {
        return reports.usage(days);
    }

    @PostMapping("/console")
    public Map<String, Object> console(@RequestBody Map<String, Object> body, Authentication auth) {
        UUID marketId = UUID.fromString(String.valueOf(body.get("marketId")));
        String task = String.valueOf(body.get("task"));
        String input = str(body.get("input"));
        if (!"EXPLAIN".equals(task) && (input == null || input.isBlank())) {
            throw new IllegalArgumentException("Escreva a pergunta ou o texto do teste");
        }
        if (input != null && input.length() > 1000) {
            input = input.substring(0, 1000);
        }
        UUID opp = body.get("opportunityId") == null || String.valueOf(body.get("opportunityId")).isBlank()
            ? null : UUID.fromString(String.valueOf(body.get("opportunityId")));
        config.audit(auth.getName(), "CONSOLE", task + " " + marketId);
        return reports.console(marketId, task, input, opp);
    }

    @GetMapping("/audit")
    public List<AiPlatformConfig.AuditEntry> audit() {
        return config.auditLog();
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
