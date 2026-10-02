package com.pdv2cloud.controller;

import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.billing.NotificationService;
import com.pdv2cloud.service.billing.SubscriptionService;
import com.pdv2cloud.service.billing.SubscriptionService.Status;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A assinatura vista pelo lojista: estado, faixa de aviso, teste grátis e avisos. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}")
@PreAuthorize("isAuthenticated()")
public class SubscriptionController {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM");

    private final SubscriptionService subscriptions;
    private final NotificationService notifications;
    private final MarketAccessService access;

    public SubscriptionController(SubscriptionService subscriptions, NotificationService notifications, MarketAccessService access) {
        this.subscriptions = subscriptions;
        this.notifications = notifications;
        this.access = access;
    }

    @GetMapping("/subscription")
    public Map<String, Object> subscription(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return view(subscriptions.of(marketId), subscriptions.settings(), LocalDateTime.now());
    }

    @PostMapping("/subscription/trial")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
    public ResponseEntity<Map<String, Object>> trial(@PathVariable UUID marketId, @RequestBody Map<String, Object> body,
                                                     Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        try {
            PlanType plan = PlanType.fromString(String.valueOf(body.get("plan")));
            SubscriptionService.Subscription s = subscriptions.startTrial(marketId, plan, auth.getName());
            return ResponseEntity.ok(view(s, subscriptions.settings(), LocalDateTime.now()));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "trial_unavailable", "userMessage", e.getMessage()));
        }
    }

    @GetMapping("/notifications")
    public List<NotificationService.Notice> notices(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return notifications.recent(marketId, 30);
    }

    @PostMapping("/notifications/{id}/read")
    public Map<String, Object> read(@PathVariable UUID marketId, @PathVariable UUID id, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        notifications.markRead(marketId, id);
        return Map.of("ok", true);
    }

    /** O que a tela precisa: estado, dias que faltam e a faixa a mostrar (ou nenhuma). */
    static Map<String, Object> view(SubscriptionService.Subscription s, SubscriptionService.Settings cfg, LocalDateTime now) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", s.status().name());
        out.put("planCode", s.planCode());
        out.put("trialPlan", s.trialPlan());
        out.put("trialEndsAt", s.trialEndsAt());
        out.put("trialAvailable", s.status() == Status.FREE && !s.trialUsed() && cfg.trialDays() > 0);
        out.put("trialDays", cfg.trialDays());
        out.put("provider", s.provider());
        out.put("paymentMethod", s.paymentMethod());
        out.put("currentPeriodEnd", s.currentPeriodEnd());
        out.put("cancelAtPeriodEnd", s.cancelAtPeriodEnd());
        out.put("pendingPlan", s.pendingPlan());
        out.put("pendingInvoiceUrl", s.pendingInvoiceUrl());
        Integer daysLeft = null;
        String tone = null;
        String message = null;
        String action = null;
        switch (s.status()) {
            case TRIAL -> {
                if (s.trialEndsAt() != null) {
                    daysLeft = (int) Math.max(0, Math.ceil(ChronoUnit.HOURS.between(now, s.trialEndsAt()) / 24.0));
                    tone = daysLeft <= 2 ? "WARNING" : "INFO";
                    message = "Teste grátis do plano " + PlanType.fromString(s.trialPlan()).getDisplayName() + ": "
                        + (daysLeft == 0 ? "termina hoje" : daysLeft == 1 ? "falta 1 dia" : "faltam " + daysLeft + " dias")
                        + ". Se não assinar, a conta volta ao Grátis sem perder nada.";
                    action = "Assinar";
                }
            }
            case PAST_DUE -> {
                LocalDateTime limit = (s.pastDueSince() == null ? now : s.pastDueSince()).plusDays(cfg.graceDays());
                daysLeft = (int) Math.max(0, ChronoUnit.DAYS.between(now.toLocalDate(), limit.toLocalDate()));
                tone = "WARNING";
                message = "Não conseguimos confirmar o pagamento. Tudo funciona até " + limit.format(DAY)
                    + "; depois, a conta fica só para consulta.";
                action = "Pagar agora";
            }
            case RESTRICTED -> {
                LocalDateTime limit = (s.restrictedSince() == null ? now : s.restrictedSince()).plusDays(cfg.restrictedDays());
                daysLeft = (int) Math.max(0, ChronoUnit.DAYS.between(now.toLocalDate(), limit.toLocalDate()));
                tone = "DANGER";
                message = "Conta só para consulta: há um pagamento em aberto. Ao pagar, tudo volta na hora. Em "
                    + limit.format(DAY) + " a conta volta ao Grátis.";
                action = "Pagar agora";
            }
            case ACTIVE -> {
                if (s.cancelAtPeriodEnd() && s.currentPeriodEnd() != null) {
                    tone = "INFO";
                    message = "Assinatura cancelada: o plano vale até " + s.currentPeriodEnd().format(DAY)
                        + " e depois a conta vai para o Grátis.";
                    action = "Ver planos";
                }
            }
            default -> { }
        }
        out.put("daysLeft", daysLeft);
        out.put("bannerTone", tone);
        out.put("bannerMessage", message);
        out.put("bannerAction", action);
        return out;
    }
}
