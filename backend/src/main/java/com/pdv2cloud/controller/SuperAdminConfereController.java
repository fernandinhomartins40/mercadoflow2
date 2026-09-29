package com.pdv2cloud.controller;

import com.pdv2cloud.service.confere.ConfereAdminService;
import com.pdv2cloud.service.confere.ConfereService;
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

/** Configuração e operação do Confere (revenda de leituras do Meu Danfe). */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/super-admin/confere")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SuperAdminConfereController {

    private final ConfereAdminService admin;

    public SuperAdminConfereController(ConfereAdminService admin) {
        this.admin = admin;
    }

    @GetMapping("/settings")
    public ConfereAdminService.Settings settings() {
        return admin.settings();
    }

    @PutMapping("/settings")
    public ConfereAdminService.Settings save(@RequestBody Map<String, Object> body, Authentication auth) {
        return admin.save(body, auth == null ? null : auth.getName());
    }

    @PostMapping("/settings/test")
    public Map<String, Object> test() {
        String problem = admin.testKey();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", problem == null);
        out.put("message", problem == null ? "A Api-Key do Meu Danfe está funcionando." : problem);
        return out;
    }

    @GetMapping("/stats")
    public ConfereAdminService.Stats stats() {
        return admin.stats();
    }

    @GetMapping("/plans")
    public List<ConfereService.Plan> plans() {
        return admin.plans();
    }

    @PostMapping("/plans")
    public List<ConfereService.Plan> createPlan(@RequestBody Map<String, Object> body) {
        return admin.savePlan(null, body);
    }

    @PutMapping("/plans/{id}")
    public List<ConfereService.Plan> updatePlan(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return admin.savePlan(id, body);
    }

    @DeleteMapping("/plans/{id}")
    public List<ConfereService.Plan> deletePlan(@PathVariable UUID id) {
        return admin.deletePlan(id);
    }

    @GetMapping("/orders")
    public List<ConfereAdminService.AdminOrder> orders(@RequestParam(required = false) String status) {
        return admin.orders(status);
    }

    @PostMapping("/orders/{id}/confirm")
    public Map<String, Object> confirm(@PathVariable UUID id, Authentication auth) {
        admin.confirmOrder(id, auth == null ? "superadmin" : auth.getName());
        return Map.of("ok", true);
    }

    @PostMapping("/orders/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable UUID id) {
        admin.cancelOrder(id);
        return Map.of("ok", true);
    }

    @GetMapping("/accounts")
    public List<ConfereAdminService.AdminAccount> accounts() {
        return admin.accounts();
    }

    @PostMapping("/accounts/{marketId}/adjust")
    public Map<String, Object> adjust(@PathVariable UUID marketId, @RequestBody Map<String, Object> body, Authentication auth) {
        int delta = body.get("delta") instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(body.get("delta")));
        admin.adjust(marketId, delta, body.get("note") == null ? null : String.valueOf(body.get("note")),
            auth == null ? null : auth.getName());
        return Map.of("ok", true);
    }
}
