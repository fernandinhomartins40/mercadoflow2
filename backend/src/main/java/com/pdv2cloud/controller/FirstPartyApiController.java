package com.pdv2cloud.controller;

import com.pdv2cloud.security.PartnerPrincipal;
import com.pdv2cloud.service.PlanService;
import com.pdv2cloud.service.partner.FirstPartyService;
import com.pdv2cloud.service.partner.PartnerAccountService;
import com.pdv2cloud.service.partner.PartnerBenefitService;
import com.pdv2cloud.service.partner.PartnerCatalogService;
import com.pdv2cloud.service.partner.PartnerDiscount;
import com.pdv2cloud.service.partner.PartnerGuard;
import com.pdv2cloud.service.partner.PartnerCallLog;
import com.pdv2cloud.service.partner.PartnerIngestService;
import com.pdv2cloud.service.partner.PartnerScopes;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * A parte da API que só o parceiro da casa (Bipae) usa: vendas do caixa,
 * catálogo por GTIN, decisões, preços da região e encartes
 * (docs/INTEGRACAO-BIPAE.md). O pedido de conexão vale para qualquer parceiro;
 * os escopos da casa só são concedidos ao parceiro da casa.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/partner")
public class FirstPartyApiController {

    private final FirstPartyService firstParty;
    private final PartnerCallLog callLog;
    private final PlanService plans;
    private final PartnerGuard partnerGuard;
    private final PartnerCatalogService catalog;
    private final PartnerAccountService accounts;
    private final PartnerBenefitService benefits;

    public FirstPartyApiController(FirstPartyService firstParty, PartnerCallLog callLog, PlanService plans, PartnerGuard partnerGuard,
                                   PartnerCatalogService catalog, PartnerAccountService accounts, PartnerBenefitService benefits) {
        this.firstParty = firstParty;
        this.callLog = callLog;
        this.plans = plans;
        this.partnerGuard = partnerGuard;
        this.catalog = catalog;
        this.accounts = accounts;
        this.benefits = benefits;
    }

    // ---------------------------------------------------------------- catálogo global (toda loja do Bipae)

    @GetMapping("/catalog/products/{gtin}")
    public ResponseEntity<?> globalProduct(@PathVariable("gtin") String gtin, Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        ResponseEntity<?> denied = partnerGuard.firstParty(p, "GET", "/catalog/products");
        if (denied != null) return denied;
        return read(p, null, "/catalog/products", () -> catalog.product(gtin));
    }

    @PostMapping("/catalog/products/lookup")
    public ResponseEntity<?> globalLookup(@RequestBody Map<String, Object> body,
                                          @RequestParam(value = "spec", defaultValue = "false") boolean spec,
                                          Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        ResponseEntity<?> denied = partnerGuard.firstParty(p, "POST", "/catalog/products");
        if (denied != null) return denied;
        return read(p, null, "/catalog/products", () -> Map.of("items", catalog.lookup(gtins(body), spec)));
    }

    @GetMapping("/catalog/search")
    public ResponseEntity<?> globalSearch(@RequestParam("q") String q, @RequestParam(value = "limit", defaultValue = "20") int limit,
                                          Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        ResponseEntity<?> denied = partnerGuard.firstParty(p, "GET", "/catalog/search");
        if (denied != null) return denied;
        return read(p, null, "/catalog/search", () -> catalog.search(q, limit));
    }

    @GetMapping("/catalog/generic-images")
    public ResponseEntity<?> genericImages(@RequestParam(value = "q", required = false) String q,
                                           @RequestParam(value = "group", required = false) String group,
                                           @RequestParam(value = "limit", defaultValue = "24") int limit,
                                           Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        ResponseEntity<?> denied = partnerGuard.firstParty(p, "GET", "/catalog/generic-images");
        if (denied != null) return denied;
        return read(p, null, "/catalog/generic-images", () -> Map.of("items", catalog.genericImages(q, group, limit)));
    }

    @PostMapping("/catalog/contributions")
    public ResponseEntity<?> contributions(@RequestBody Map<String, Object> body, Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        ResponseEntity<?> denied = partnerGuard.firstParty(p, "POST", "/catalog/contributions");
        if (denied != null) return denied;
        return write(p, null, "/catalog/contributions", () -> catalog.contribute(p.partnerId(), items(body)));
    }

    // ---------------------------------------------------------------- contas e desconto

    /** "Criar minha conta no MercadoFlow" de dentro do Bipae. 201 criada; 409 já tem conta (vem o link de conexão). */
    @PostMapping("/accounts")
    public ResponseEntity<?> createAccount(@RequestBody Map<String, Object> body, Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        ResponseEntity<?> denied = partnerGuard.firstParty(p, "POST", "/accounts");
        if (denied != null) return denied;
        try {
            PartnerAccountService.Result r = accounts.create(p.partnerId(), p.name(), body == null ? Map.of() : body);
            callLog.record(p.partnerId(), r.created() ? (UUID) r.body().get("marketId") : null, "POST", "/accounts", null,
                r.created() ? 201 : 409);
            return ResponseEntity.status(r.created() ? HttpStatus.CREATED : HttpStatus.CONFLICT).body(r.body());
        } catch (IllegalArgumentException e) {
            callLog.record(p.partnerId(), null, "POST", "/accounts", null, 400);
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    /** O Bipae informa se a loja é cliente ativo dele: é o que liga e desliga o desconto no plano. */
    @PutMapping("/markets/{id}/customer")
    public ResponseEntity<?> customer(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body,
                                      Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        ResponseEntity<?> denied = partnerGuard.firstParty(p, "PUT", "/markets/{id}/customer");
        if (denied != null) return denied;
        if (!(body != null && body.get("active") instanceof Boolean active)) {
            return ResponseEntity.badRequest().body(error("Envie { \"active\": true|false }."));
        }
        benefits.setCustomerActive(p.partnerId(), id, active);
        callLog.record(p.partnerId(), id, "PUT", "/markets/{id}/customer", null, 200);
        return ResponseEntity.ok(Map.of("active", active, "discount", benefitView(id)));
    }

    @GetMapping("/markets/{id}/benefit")
    public ResponseEntity<?> benefit(@PathVariable("id") UUID id, Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        ResponseEntity<?> denied = partnerGuard.firstParty(p, "GET", "/markets/{id}/benefit");
        if (denied != null) return denied;
        return ResponseEntity.ok(Map.of("discount", benefitView(id)));
    }

    private Object benefitView(UUID marketId) {
        PartnerDiscount.Discount d = discount.forRoot(com.pdv2cloud.tenancy.TenantContext.runAsSystem(() -> subscriptions.rootOf(marketId)));
        return d == null ? Map.of("active", false) : Map.of("active", true, "partner", d.partnerName(), "percent", d.percent());
    }

    @org.springframework.beans.factory.annotation.Autowired
    private PartnerDiscount discount;

    @org.springframework.beans.factory.annotation.Autowired
    private com.pdv2cloud.service.billing.SubscriptionService subscriptions;

    private static Map<String, Object> error(String message) {
        return Map.of("erro", message);
    }

    private static PartnerPrincipal principal(Authentication authentication) {
        return (PartnerPrincipal) authentication.getPrincipal();
    }

    /** Null quando pode seguir; senão a resposta de recusa (já registrada no log). */
    private ResponseEntity<?> guard(PartnerPrincipal p, UUID marketId, String method, String path, String scope,
                                    HttpServletRequest request) {
        return partnerGuard.store(p, marketId, method, path, scope, request);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> items(Map<String, Object> body) {
        Object items = body == null ? null : body.get("items");
        if (!(items instanceof List<?> l)) throw new IllegalArgumentException("Envie { \"items\": [ ... ] }.");
        return l.stream().map(o -> o instanceof Map<?, ?> m ? (Map<String, Object>) m : null).toList();
    }

    private ResponseEntity<?> write(PartnerPrincipal p, UUID marketId, String path, Supplier<PartnerIngestService.BatchResult> work) {
        try {
            PartnerIngestService.BatchResult r = work.get();
            callLog.record(p.partnerId(), marketId, "POST", path, r, 200);
            return ResponseEntity.ok(r);
        } catch (IllegalArgumentException e) {
            callLog.record(p.partnerId(), marketId, "POST", path, null, 400);
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    private ResponseEntity<?> read(PartnerPrincipal p, UUID marketId, String path, Supplier<Object> work) {
        try {
            Object out = work.get();
            int n = out instanceof List<?> l ? l.size()
                : out instanceof Map<?, ?> m && m.get("items") instanceof List<?> l2 ? l2.size() : 1;
            callLog.read(p.partnerId(), marketId, path, n);
            return ResponseEntity.ok(out);
        } catch (IllegalArgumentException e) {
            callLog.record(p.partnerId(), marketId, "GET", path, null, 400);
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    // ---------------------------------------------------------------- conexão

    /** "Conectar ao MercadoFlow": devolve o link que o dono abre para aprovar. */
    @PostMapping("/connect")
    public ResponseEntity<?> connect(@RequestBody Map<String, Object> body, Authentication authentication) {
        try {
            return ResponseEntity.ok(firstParty.createConnect(principal(authentication).partnerId(), body == null ? Map.of() : body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @GetMapping("/connect/{code}")
    public ResponseEntity<?> connectStatus(@PathVariable("code") String code, Authentication authentication) {
        Map<String, Object> out = firstParty.connectStatus(principal(authentication).partnerId(), code);
        return out == null ? ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("Pedido de conexão não encontrado.")) : ResponseEntity.ok(out);
    }

    // ---------------------------------------------------------------- vendas

    @PostMapping("/markets/{id}/sales")
    public ResponseEntity<?> sales(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body,
                                   @RequestParam(value = "dryRun", defaultValue = "false") boolean dryRun,
                                   HttpServletRequest request, Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        String path = "/markets/{id}/sales";
        ResponseEntity<?> denied = guard(p, id, "POST", path, PartnerScopes.SALES_WRITE, request);
        if (denied != null) return denied;
        return write(p, id, path, () -> firstParty.sales(p.partnerId(), id, items(body), dryRun));
    }

    @PostMapping("/markets/{id}/sales/cancel")
    public ResponseEntity<?> cancelSales(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body,
                                         HttpServletRequest request, Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        String path = "/markets/{id}/sales/cancel";
        ResponseEntity<?> denied = guard(p, id, "POST", path, PartnerScopes.SALES_WRITE, request);
        if (denied != null) return denied;
        return write(p, id, path, () -> firstParty.cancelSales(id, items(body)));
    }

    // ---------------------------------------------------------------- catálogo

    @GetMapping("/markets/{id}/catalog/{gtin}")
    public ResponseEntity<?> catalogOne(@PathVariable("id") UUID id, @PathVariable("gtin") String gtin,
                                        HttpServletRequest request, Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        String path = "/markets/{id}/catalog";
        ResponseEntity<?> denied = guard(p, id, "GET", path, PartnerScopes.CATALOG_READ, request);
        if (denied != null) return denied;
        return read(p, id, path, () -> firstParty.catalog(id, List.of(gtin)).get(0));
    }

    @PostMapping("/markets/{id}/catalog/lookup")
    public ResponseEntity<?> catalogLookup(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body,
                                           HttpServletRequest request, Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        String path = "/markets/{id}/catalog";
        ResponseEntity<?> denied = guard(p, id, "POST", path, PartnerScopes.CATALOG_READ, request);
        if (denied != null) return denied;
        return read(p, id, path, () -> Map.of("items", firstParty.catalog(id, gtins(body))));
    }

    private static List<String> gtins(Map<String, Object> body) {
        if (body == null || !(body.get("gtins") instanceof List<?> l)) throw new IllegalArgumentException("Envie { \"gtins\": [ ... ] }.");
        return l.stream().map(String::valueOf).toList();
    }

    // ---------------------------------------------------------------- inteligência

    @GetMapping("/markets/{id}/decisions")
    public ResponseEntity<?> decisions(@PathVariable("id") UUID id,
                                       @RequestParam(value = "actionType", required = false) String actionType,
                                       @RequestParam(value = "limit", defaultValue = "20") int limit,
                                       HttpServletRequest request, Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        String path = "/markets/{id}/decisions";
        ResponseEntity<?> denied = guard(p, id, "GET", path, PartnerScopes.INSIGHTS_READ, request);
        if (denied != null) return denied;
        String type = actionType == null || actionType.isBlank() ? null : actionType.trim().toUpperCase();
        return read(p, id, path, () -> firstParty.decisions(id, type, limit, plans.limitsFor(id).fullInsights(),
            PlanService.PAID_OPPORTUNITY_TYPES));
    }

    @GetMapping("/markets/{id}/local-prices")
    public ResponseEntity<?> localPrices(@PathVariable("id") UUID id, @RequestParam("gtins") String gtins,
                                         HttpServletRequest request, Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        String path = "/markets/{id}/local-prices";
        ResponseEntity<?> denied = guard(p, id, "GET", path, PartnerScopes.INSIGHTS_READ, request);
        if (denied != null) return denied;
        return read(p, id, path, () -> Map.of("items", firstParty.localPrices(id, Arrays.asList(gtins.split(",")))));
    }

    @GetMapping("/markets/{id}/promotions")
    public ResponseEntity<?> promotions(@PathVariable("id") UUID id, HttpServletRequest request, Authentication authentication) {
        PartnerPrincipal p = principal(authentication);
        String path = "/markets/{id}/promotions";
        ResponseEntity<?> denied = guard(p, id, "GET", path, PartnerScopes.PROMOTIONS_READ, request);
        if (denied != null) return denied;
        return read(p, id, path, () -> firstParty.promotions(id));
    }
}
