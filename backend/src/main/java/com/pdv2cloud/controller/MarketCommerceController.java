package com.pdv2cloud.controller;

import com.pdv2cloud.security.AppUserDetails;
import com.pdv2cloud.service.commerce.CommerceCampaignService;
import com.pdv2cloud.service.commerce.CommerceMarketService;
import com.pdv2cloud.service.commerce.CommerceOrderService;
import com.pdv2cloud.service.team.TeamRole;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Compras digitais da loja: vendedores que a atendem, catálogo com o preço
 * que vale para ela, campanhas recebidas, pedidos e o que ela autoriza.
 * O {marketId} do caminho é conferido contra a sessão pelo TenantAccessFilter.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/commerce")
public class MarketCommerceController {

    private final CommerceMarketService market;
    private final CommerceCampaignService campaigns;
    private final CommerceOrderService orders;

    public MarketCommerceController(CommerceMarketService market, CommerceCampaignService campaigns, CommerceOrderService orders) {
        this.market = market;
        this.campaigns = campaigns;
        this.orders = orders;
    }

    @GetMapping("/sellers")
    public List<Map<String, Object>> sellers(@PathVariable UUID marketId) {
        return market.sellers(marketId);
    }

    @GetMapping("/sellers/{sellerId}/catalog")
    public List<Map<String, Object>> catalog(@PathVariable UUID marketId, @PathVariable UUID sellerId,
                                             @RequestParam(required = false) String q) {
        return market.catalog(marketId, sellerId, q);
    }

    /** Quem vende este produto à loja, e por quanto. */
    @GetMapping("/offers")
    public List<Map<String, Object>> offers(@PathVariable UUID marketId, @RequestParam String gtin) {
        return market.offers(marketId, gtin);
    }

    // ── Campanhas recebidas ───────────────────────────────────────────────

    @GetMapping("/campaigns")
    public List<Map<String, Object>> campaigns(@PathVariable UUID marketId) {
        return campaigns.inbox(marketId);
    }

    @PostMapping("/campaigns/{deliveryId}/seen")
    public Map<String, Object> seen(@PathVariable UUID marketId, @PathVariable UUID deliveryId) {
        campaigns.seen(marketId, deliveryId);
        return Map.of("ok", true);
    }

    @PostMapping("/campaigns/{deliveryId}/refuse")
    public Map<String, Object> refuse(@PathVariable UUID marketId, @PathVariable UUID deliveryId,
                                      @RequestBody(required = false) Map<String, Object> body, @AuthenticationPrincipal AppUserDetails user) {
        campaigns.refuse(marketId, deliveryId, body == null ? null : (String) body.get("reason"), actor(user));
        return Map.of("ok", true);
    }

    // ── Pedidos ───────────────────────────────────────────────────────────

    @GetMapping("/orders")
    public List<Map<String, Object>> orders(@PathVariable UUID marketId) {
        return orders.listForMarket(marketId);
    }

    @GetMapping("/orders/{orderId}")
    public Map<String, Object> order(@PathVariable UUID marketId, @PathVariable UUID orderId) {
        return orders.forMarket(marketId, orderId);
    }

    @PostMapping("/orders")
    public Map<String, Object> create(@PathVariable UUID marketId, @RequestBody Map<String, Object> body,
                                      @AuthenticationPrincipal AppUserDetails user) {
        return orders.create(marketId, body, actor(user));
    }

    @PostMapping("/orders/{orderId}/cancel")
    public Map<String, Object> cancel(@PathVariable UUID marketId, @PathVariable UUID orderId,
                                      @RequestBody(required = false) Map<String, Object> body, @AuthenticationPrincipal AppUserDetails user) {
        return orders.cancelByMarket(marketId, orderId, body == null ? null : (String) body.get("reason"), actor(user));
    }

    @PostMapping("/orders/{orderId}/received")
    public Map<String, Object> received(@PathVariable UUID marketId, @PathVariable UUID orderId, @AuthenticationPrincipal AppUserDetails user) {
        return orders.receivedByMarket(marketId, orderId, actor(user));
    }

    // ── Preferências e autorizações (só o dono) ───────────────────────────

    @GetMapping("/preferences")
    public Map<String, Object> preferences(@PathVariable UUID marketId) {
        return market.preferences(marketId);
    }

    @PutMapping("/preferences")
    public Map<String, Object> setPreferences(@PathVariable UUID marketId, @RequestBody Map<String, Object> body,
                                              @AuthenticationPrincipal AppUserDetails user) {
        ownerOnly(user);
        boolean receive = !Boolean.FALSE.equals(body.get("receiveCampaigns"));
        boolean network = Boolean.TRUE.equals(body.get("wholeNetwork"));
        // Decidir pela rede escreve nas filiais, que a sessão da matriz não alcança.
        return network ? TenantContext.runAsSystem(() -> market.setReceiveCampaigns(marketId, receive, true, actor(user)))
            : market.setReceiveCampaigns(marketId, receive, false, actor(user));
    }

    @PutMapping("/consents/{sellerId}")
    public Map<String, Object> setConsent(@PathVariable UUID marketId, @PathVariable UUID sellerId, @RequestBody Map<String, Object> body,
                                          @AuthenticationPrincipal AppUserDetails user) {
        ownerOnly(user);
        String status = body.get("status") == null ? null : String.valueOf(body.get("status"));
        boolean network = Boolean.TRUE.equals(body.get("wholeNetwork"));
        return network ? TenantContext.runAsSystem(() -> market.setConsent(marketId, sellerId, status, true, actor(user)))
            : market.setConsent(marketId, sellerId, status, false, actor(user));
    }

    private static void ownerOnly(AppUserDetails user) {
        if (user != null && user.getTeamRole() != null && user.getTeamRole() != TeamRole.DONO) {
            throw new IllegalArgumentException("Só o dono da conta decide sobre vendedores e campanhas.");
        }
    }

    private static String actor(AppUserDetails user) {
        return user == null ? null : user.getUsername();
    }
}
