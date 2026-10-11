package com.pdv2cloud.controller;

import com.pdv2cloud.service.commerce.CommerceAdminService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Superadmin das vendas: vendedores, titularidade dos produtos, canais e volume. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/super-admin/commerce")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SuperAdminCommerceController {

    private final CommerceAdminService admin;

    public SuperAdminCommerceController(CommerceAdminService admin) {
        this.admin = admin;
    }

    @GetMapping("/overview")
    public Map<String, Object> overview() {
        return admin.overview();
    }

    // ── Vendedores ────────────────────────────────────────────────────────

    @GetMapping("/sellers")
    public List<Map<String, Object>> sellers() {
        return admin.list();
    }

    @PostMapping("/sellers")
    public Map<String, Object> create(@RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails user) {
        return admin.create(body, user.getUsername());
    }

    @GetMapping("/sellers/{id}")
    public Map<String, Object> seller(@PathVariable UUID id) {
        return admin.get(id);
    }

    @PutMapping("/sellers/{id}")
    public Map<String, Object> update(@PathVariable UUID id, @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails user) {
        return admin.update(id, body, user.getUsername());
    }

    @PostMapping("/sellers/{id}/status")
    public Map<String, Object> status(@PathVariable UUID id, @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails user) {
        return admin.setStatus(id, String.valueOf(body.get("status")), (String) body.get("reason"), user.getUsername());
    }

    @PostMapping("/sellers/{id}/users")
    public Map<String, Object> createUser(@PathVariable UUID id, @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails user) {
        return admin.createUser(id, body, user.getUsername());
    }

    @PostMapping("/sellers/{id}/users/{userId}/active")
    public Map<String, Object> userActive(@PathVariable UUID id, @PathVariable UUID userId, @RequestBody Map<String, Object> body,
                                          @AuthenticationPrincipal UserDetails user) {
        return admin.setUserActive(id, userId, !Boolean.FALSE.equals(body.get("active")), user.getUsername());
    }

    // ── Titularidade ──────────────────────────────────────────────────────

    @GetMapping("/products/pending")
    public List<Map<String, Object>> pendingProducts() {
        return admin.pendingProducts();
    }

    @PostMapping("/products/{productId}/decide")
    public List<Map<String, Object>> decideProduct(@PathVariable UUID productId, @RequestBody Map<String, Object> body,
                                                   @AuthenticationPrincipal UserDetails user) {
        admin.decideProduct(productId, Boolean.TRUE.equals(body.get("approve")), (String) body.get("note"), user.getUsername());
        return admin.pendingProducts();
    }

    // ── Canais ────────────────────────────────────────────────────────────

    @GetMapping("/agreements")
    public List<Map<String, Object>> agreements() {
        return admin.agreements();
    }

    @GetMapping("/alerts")
    public List<Map<String, Object>> alerts() {
        return admin.alerts();
    }

    @GetMapping("/stores")
    public List<Map<String, Object>> stores() {
        return admin.stores();
    }

    @GetMapping("/simulate")
    public Map<String, Object> simulate(@RequestParam UUID marketId, @RequestParam String gtin) {
        return admin.simulate(marketId, gtin);
    }
}
