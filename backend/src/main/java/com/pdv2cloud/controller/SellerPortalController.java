package com.pdv2cloud.controller;

import com.pdv2cloud.service.commerce.CommerceCampaignService;
import com.pdv2cloud.service.commerce.CommerceCatalogService;
import com.pdv2cloud.service.commerce.CommerceOrderService;
import com.pdv2cloud.service.commerce.CommerceSellerService;
import com.pdv2cloud.service.commerce.SellerAccessService;
import com.pdv2cloud.service.commerce.SellerAccessService.Seller;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Portal de vendas: o vendedor (indústria ou distribuidor) cuida do catálogo,
 * dos preços, das campanhas e dos pedidos.
 *
 * Toda rota resolve o vendedor pela sessão e filtra por ele; nenhuma aceita o
 * vendedor por parâmetro. O trabalho roda como sistema porque o vendedor não é
 * um tenant de loja: o que ele pode ver de cada loja é decidido nos serviços
 * (só quem pediu ou autorizou aparece pelo nome).
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/seller")
@PreAuthorize("hasAnyRole('SELLER_USER', 'INDUSTRY_USER')")
public class SellerPortalController {

    private final SellerAccessService access;
    private final CommerceSellerService sellers;
    private final CommerceCatalogService catalog;
    private final CommerceCampaignService campaigns;
    private final CommerceOrderService orders;

    public SellerPortalController(SellerAccessService access, CommerceSellerService sellers, CommerceCatalogService catalog,
                                  CommerceCampaignService campaigns, CommerceOrderService orders) {
        this.access = access;
        this.sellers = sellers;
        this.catalog = catalog;
        this.campaigns = campaigns;
        this.orders = orders;
    }

    private static <T> T sys(Supplier<T> work) {
        return TenantContext.runAsSystem(work);
    }

    private Seller seller(UserDetails user) {
        return sys(() -> access.of(user.getUsername()));
    }

    private Seller active(UserDetails user) {
        return sys(() -> access.active(user.getUsername()));
    }

    /** Dados do vendedor. Responde mesmo em análise ou suspenso, para o portal explicar o que falta. */
    @GetMapping("/me")
    public Map<String, Object> me(@AuthenticationPrincipal UserDetails user) {
        Seller s = seller(user);
        Map<String, Object> out = new LinkedHashMap<>(sys(() -> sellers.profile(s.id())));
        out.put("access", s.active());
        return out;
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(@AuthenticationPrincipal UserDetails user) {
        Seller s = active(user);
        return sys(() -> sellers.dashboard(s.id()));
    }

    @PutMapping("/profile")
    public Map<String, Object> profile(@AuthenticationPrincipal UserDetails user, @RequestBody Map<String, Object> body) {
        Seller s = seller(user);
        return sys(() -> sellers.updateProfile(s, body));
    }

    // ── Catálogo ──────────────────────────────────────────────────────────

    @GetMapping("/products")
    public List<Map<String, Object>> products(@AuthenticationPrincipal UserDetails user) {
        Seller s = seller(user);
        return sys(() -> catalog.products(s.id()));
    }

    @PostMapping("/products")
    public Map<String, Object> saveProduct(@AuthenticationPrincipal UserDetails user, @RequestBody Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> catalog.saveProduct(s, body));
    }

    @PostMapping("/products/{gtin}/pause")
    public Map<String, Object> pauseProduct(@AuthenticationPrincipal UserDetails user, @PathVariable String gtin,
                                            @RequestBody Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> catalog.pauseProduct(s.id(), gtin, !Boolean.FALSE.equals(body.get("paused"))));
    }

    @DeleteMapping("/products/{gtin}")
    public Map<String, Object> removeProduct(@AuthenticationPrincipal UserDetails user, @PathVariable String gtin) {
        Seller s = active(user);
        TenantContext.runAsSystem(() -> catalog.removeProduct(s.id(), gtin));
        return Map.of("ok", true);
    }

    // ── Preços ────────────────────────────────────────────────────────────

    @GetMapping("/price-lists")
    public List<Map<String, Object>> priceLists(@AuthenticationPrincipal UserDetails user) {
        Seller s = seller(user);
        return sys(() -> catalog.priceLists(s.id()));
    }

    @PostMapping("/price-lists")
    public List<Map<String, Object>> createPriceList(@AuthenticationPrincipal UserDetails user, @RequestBody Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> {
            catalog.savePriceList(s, null, body);
            return catalog.priceLists(s.id());
        });
    }

    @PutMapping("/price-lists/{id}")
    public List<Map<String, Object>> updatePriceList(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id,
                                                     @RequestBody Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> {
            catalog.savePriceList(s, id, body);
            return catalog.priceLists(s.id());
        });
    }

    @DeleteMapping("/price-lists/{id}")
    public List<Map<String, Object>> deletePriceList(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id) {
        Seller s = active(user);
        return sys(() -> {
            catalog.deletePriceList(s.id(), id);
            return catalog.priceLists(s.id());
        });
    }

    // ── Distribuição (indústria) ──────────────────────────────────────────

    @GetMapping("/distribution")
    public Map<String, Object> distribution(@AuthenticationPrincipal UserDetails user) {
        Seller s = seller(user);
        return sys(() -> sellers.distribution(s));
    }

    @PostMapping("/distribution/sales-mode")
    public Map<String, Object> salesMode(@AuthenticationPrincipal UserDetails user, @RequestBody Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> sellers.setSalesMode(s, String.valueOf(body.get("salesMode")), Boolean.TRUE.equals(body.get("acceptTerms"))));
    }

    @PostMapping("/distribution/agreements")
    public Map<String, Object> createAgreement(@AuthenticationPrincipal UserDetails user, @RequestBody Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> sellers.saveAgreement(s, null, body));
    }

    @PutMapping("/distribution/agreements/{id}")
    public Map<String, Object> updateAgreement(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id,
                                               @RequestBody Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> sellers.saveAgreement(s, id, body));
    }

    @PostMapping("/distribution/agreements/{id}/end")
    public Map<String, Object> endAgreement(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id) {
        Seller s = active(user);
        return sys(() -> sellers.endAgreement(s, id));
    }

    @PostMapping("/distribution/direct-accounts")
    public Map<String, Object> addDirectAccount(@AuthenticationPrincipal UserDetails user, @RequestBody Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> sellers.addDirectAccount(s, body));
    }

    @DeleteMapping("/distribution/direct-accounts/{id}")
    public Map<String, Object> removeDirectAccount(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id) {
        Seller s = active(user);
        return sys(() -> sellers.removeDirectAccount(s, id));
    }

    // ── Clientes ──────────────────────────────────────────────────────────

    @GetMapping("/clients")
    public List<Map<String, Object>> clients(@AuthenticationPrincipal UserDetails user) {
        Seller s = active(user);
        return sys(() -> sellers.clients(s.id()));
    }

    // ── Campanhas ─────────────────────────────────────────────────────────

    @GetMapping("/campaigns")
    public List<Map<String, Object>> campaigns(@AuthenticationPrincipal UserDetails user) {
        Seller s = active(user);
        return sys(() -> campaigns.list(s.id()));
    }

    @GetMapping("/campaigns/{id}")
    public Map<String, Object> campaign(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id) {
        Seller s = active(user);
        return sys(() -> campaigns.get(s.id(), id));
    }

    @PostMapping("/campaigns")
    public Map<String, Object> createCampaign(@AuthenticationPrincipal UserDetails user, @RequestBody Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> campaigns.save(s, null, body));
    }

    @PutMapping("/campaigns/{id}")
    public Map<String, Object> updateCampaign(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id,
                                              @RequestBody Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> campaigns.save(s, id, body));
    }

    @PostMapping("/campaigns/{id}/preview")
    public Map<String, Object> previewCampaign(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id) {
        Seller s = active(user);
        return sys(() -> campaigns.preview(s, id));
    }

    @PostMapping("/campaigns/{id}/send")
    public Map<String, Object> sendCampaign(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id) {
        Seller s = active(user);
        return sys(() -> campaigns.send(s, id));
    }

    @PostMapping("/campaigns/{id}/close")
    public Map<String, Object> closeCampaign(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id) {
        Seller s = active(user);
        return sys(() -> campaigns.close(s, id));
    }

    // ── Pedidos ───────────────────────────────────────────────────────────

    @GetMapping("/orders")
    public List<Map<String, Object>> orders(@AuthenticationPrincipal UserDetails user, @RequestParam(required = false) String status) {
        Seller s = active(user);
        return sys(() -> orders.listForSeller(s.id(), status));
    }

    /** Pedidos das campanhas da indústria atendidos por distribuidor. */
    @GetMapping("/orders/by-distributors")
    public List<Map<String, Object>> ordersByDistributors(@AuthenticationPrincipal UserDetails user) {
        Seller s = active(user);
        return sys(() -> orders.listFulfilledByOthers(s.id()));
    }

    @GetMapping("/orders/{id}")
    public Map<String, Object> order(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id) {
        Seller s = active(user);
        return sys(() -> orders.forSeller(s.id(), id));
    }

    @PostMapping("/orders/{id}/confirm")
    public Map<String, Object> confirm(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> orders.confirm(s.id(), id, body == null ? Map.of() : body, user.getUsername()));
    }

    @PostMapping("/orders/{id}/refuse")
    public Map<String, Object> refuse(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id, @RequestBody Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> orders.refuse(s.id(), id, (String) body.get("reason"), user.getUsername()));
    }

    @PostMapping("/orders/{id}/invoice")
    public Map<String, Object> invoice(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id, @RequestBody Map<String, Object> body) {
        Seller s = active(user);
        return sys(() -> orders.invoice(s.id(), id, body, user.getUsername()));
    }

    @PostMapping("/orders/{id}/delivered")
    public Map<String, Object> delivered(@AuthenticationPrincipal UserDetails user, @PathVariable UUID id) {
        Seller s = active(user);
        return sys(() -> orders.delivered(s.id(), id, user.getUsername()));
    }

    @ExceptionHandler(SellerAccessService.Denied.class)
    public ResponseEntity<Map<String, Object>> denied(SellerAccessService.Denied e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", e.status() == 429 ? "rate_limited" : "seller_access");
        body.put("message", e.getMessage());
        body.put("userMessage", e.getMessage());
        return ResponseEntity.status(e.status()).body(body);
    }
}
