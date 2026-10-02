package com.pdv2cloud.controller;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.PlanCatalogService;
import com.pdv2cloud.service.PlanService;
import com.pdv2cloud.service.StripeAdminService;
import com.pdv2cloud.service.ai.platform.AiWalletService;
import com.pdv2cloud.service.billing.AddonService;
import com.pdv2cloud.service.billing.AsaasService;
import com.pdv2cloud.service.billing.Entitlements;
import com.pdv2cloud.service.billing.SubscriptionService;
import com.pdv2cloud.service.billing.SubscriptionService.Status;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * "Minha assinatura": plano, estado, uso, créditos, adicionais, faturas,
 * pausa e cancelamento numa tela só.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/subscription")
@PreAuthorize("isAuthenticated()")
public class MySubscriptionController {

    private static final Logger log = LoggerFactory.getLogger(MySubscriptionController.class);
    static final Set<String> EXIT_REASONS = Set.of("PRECO", "POUCO_USO", "FALTOU_RECURSO", "SAZONAL", "FECHOU_LOJA", "OUTRO");

    private final SubscriptionService subscriptions;
    private final AddonService addons;
    private final AsaasService asaas;
    private final Entitlements entitlements;
    private final PlanService plans;
    private final PlanCatalogService catalog;
    private final AiWalletService wallets;
    private final StripeAdminService stripeAdmin;
    private final MarketRepository markets;
    private final MarketAccessService access;
    private final NamedParameterJdbcTemplate jdbc;

    public MySubscriptionController(SubscriptionService subscriptions, AddonService addons, AsaasService asaas,
                                    Entitlements entitlements, PlanService plans, PlanCatalogService catalog,
                                    AiWalletService wallets, StripeAdminService stripeAdmin, MarketRepository markets,
                                    MarketAccessService access, NamedParameterJdbcTemplate jdbc) {
        this.subscriptions = subscriptions;
        this.addons = addons;
        this.asaas = asaas;
        this.entitlements = entitlements;
        this.plans = plans;
        this.catalog = catalog;
        this.wallets = wallets;
        this.stripeAdmin = stripeAdmin;
        this.markets = markets;
        this.access = access;
        this.jdbc = jdbc;
    }

    @GetMapping("/overview")
    public Map<String, Object> overview(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        UUID root = subscriptions.rootOf(marketId);
        SubscriptionService.Subscription s = subscriptions.of(root);
        PlanType contracted = PlanType.fromString(s.status() == Status.TRIAL ? s.trialPlan() : s.planCode());
        PlanType effective = entitlements.planOf(marketId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("subscription", SubscriptionController.view(s, subscriptions.settings(), LocalDateTime.now()));
        var entry = catalog.entryFor(contracted);
        out.put("plan", Map.of("code", contracted.name(), "name", contracted.getDisplayName(),
            "priceCents", entry.getMonthlyPriceCents() == null ? 0 : entry.getMonthlyPriceCents()));
        out.put("effectivePlan", effective.name());
        out.put("features", entitlements.featuresOf(effective));

        PlanService.UsageSnapshot usage = plans.usageFor(root);
        Map<String, Object> u = new LinkedHashMap<>();
        u.put("stores", usage.branchCount());
        u.put("storesLimit", usage.limits().branches());
        u.put("pdvs", usage.pdvCount());
        u.put("pdvsLimit", usage.limits().pdvs());
        u.put("seats", usage.seatCount());
        u.put("seatsLimit", usage.limits().seats());
        out.put("usage", u);
        out.put("ai", wallets.wallet(marketId));
        List<Integer> confere = jdbc.queryForList("select balance from confere_accounts where market_id = :m", Map.of("m", marketId), Integer.class);
        out.put("confereBalance", confere.isEmpty() ? 0 : confere.get(0));

        out.put("addons", addons.list(root));
        out.put("monthlyTotalCents", addons.monthlyTotalCents(root, contracted));
        List<?> invoices = List.of();
        try {
            if (asaas.enabled()) {
                invoices = asaas.invoices(root);
            }
        } catch (RuntimeException e) {
            log.warn("Faturas do Asaas indisponíveis para {}: {}", root, e.getMessage());
        }
        out.put("invoices", invoices);
        boolean paidActive = s.status() == Status.ACTIVE && !s.cancelAtPeriodEnd();
        out.put("canChangeAddons", paidActive && AsaasService.PROVIDER.equals(s.provider()));
        out.put("canPause", paidActive && AsaasService.PROVIDER.equals(s.provider()));
        out.put("canResume", s.status() == Status.PAUSED);
        out.put("canCancel", paidActive && (AsaasService.PROVIDER.equals(s.provider()) || "STRIPE".equals(s.provider())));
        out.put("pausedUntil", s.pausedUntil());
        return out;
    }

    @PutMapping("/addons/{code}")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
    public ResponseEntity<?> setAddon(@PathVariable UUID marketId, @PathVariable String code, @RequestBody Map<String, Object> body,
                                      Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        try {
            int qty = body.get("quantity") instanceof Number n ? n.intValue() : -1;
            return ResponseEntity.ok(addons.setQuantity(marketId, code, qty));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "addon", "userMessage", e.getMessage()));
        }
    }

    /** Pausa de 1 ou 2 meses no lugar do cancelamento (lojas sazonais). */
    @PostMapping("/pause")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
    public ResponseEntity<?> pause(@PathVariable UUID marketId, @RequestBody Map<String, Object> body, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        try {
            int months = body.get("months") instanceof Number n ? n.intValue() : 0;
            if (months != 1 && months != 2) {
                throw new IllegalArgumentException("A pausa é de 1 ou 2 meses.");
            }
            UUID root = subscriptions.rootOf(marketId);
            SubscriptionService.Subscription s = subscriptions.of(root);
            if (s.status() != Status.ACTIVE || s.cancelAtPeriodEnd() || !AsaasService.PROVIDER.equals(s.provider())) {
                throw new IllegalStateException("A pausa vale para assinaturas ativas por Pix ou boleto.");
            }
            LocalDate base = s.currentPeriodEnd() != null && s.currentPeriodEnd().isAfter(LocalDateTime.now())
                ? s.currentPeriodEnd().toLocalDate() : LocalDate.now();
            asaas.reschedule(s.providerSubscriptionId(), base.plusMonths(months));
            subscriptions.pause(root, months, "Pausa de " + months + (months == 1 ? " mês" : " meses") + " (" + auth.getName() + ")");
            subscriptions.recordExit(root, reason(body), comment(body), "PAUSED", auth.getName());
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "pause", "userMessage", e.getMessage()));
        }
    }

    @PostMapping("/resume")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
    public ResponseEntity<?> resume(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        subscriptions.resume(subscriptions.rootOf(marketId), "Pausa encerrada pelo cliente (" + auth.getName() + ")");
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** Cancela no fim do período pago, guardando o motivo. */
    @PostMapping("/cancel")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
    public ResponseEntity<?> cancel(@PathVariable UUID marketId, @RequestBody Map<String, Object> body, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        try {
            UUID root = subscriptions.rootOf(marketId);
            SubscriptionService.Subscription s = subscriptions.of(root);
            if (s.status() != Status.ACTIVE || s.cancelAtPeriodEnd()) {
                throw new IllegalStateException("Não há assinatura ativa para cancelar.");
            }
            if (AsaasService.PROVIDER.equals(s.provider())) {
                asaas.cancelSubscription(s.providerSubscriptionId());
            } else if ("STRIPE".equals(s.provider())) {
                Market market = markets.findById(root).orElseThrow();
                String warning = stripeAdmin.cancelSubscription(market, true, reason(body));
                if (warning != null) {
                    throw new IllegalStateException("Não foi possível cancelar no cartão agora. Tente de novo em instantes.");
                }
            } else {
                throw new IllegalStateException("Sua assinatura foi negociada com o comercial: o cancelamento é feito por lá.");
            }
            subscriptions.cancel(root, true, "Cancelada pelo cliente (" + auth.getName() + "): " + reason(body));
            subscriptions.recordExit(root, reason(body), comment(body), "CANCELED", auth.getName());
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "cancel", "userMessage", e.getMessage()));
        }
    }

    private static String reason(Map<String, Object> body) {
        String r = body.get("reason") == null ? "OUTRO" : String.valueOf(body.get("reason"));
        return EXIT_REASONS.contains(r) ? r : "OUTRO";
    }

    private static String comment(Map<String, Object> body) {
        return body.get("comment") == null ? null : String.valueOf(body.get("comment")).trim();
    }
}
