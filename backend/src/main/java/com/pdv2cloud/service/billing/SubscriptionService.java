package com.pdv2cloud.service.billing;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.SubscriptionEventService;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import com.pdv2cloud.tenancy.TenantContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * A assinatura do cliente: uma por rede (na matriz), com estado único e ciclo
 * de vida automático (docs/PROPOSTA-ASSINATURAS.md, seção 5.2).
 *
 * <pre>
 * FREE ⇄ TRIAL (7 dias, uma vez) → ACTIVE → PAST_DUE (carência) → RESTRICTED (só consulta)
 *                                    ↑______ pagamento confirmado ______|          │ 30 dias
 *                                                                        FREE ←────┘
 * </pre>
 *
 * O plano Grátis é permanente: quem não paga volta para ele e nunca perde a conta.
 * Os campos antigos do mercado (plan_type, billing_status, trial_ends_at) são
 * espelho desta tabela; o resto do sistema lê o espelho e não precisa mudar.
 */
@Service
public class SubscriptionService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionService.class);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM");

    public enum Status { FREE, TRIAL, ACTIVE, PAST_DUE, RESTRICTED, PAUSED, SUSPENDED, PENDING, CANCELLED }

    public record Settings(int trialDays, int graceDays, int restrictedDays) {}

    public record Subscription(UUID marketId, String planCode, Status status, String provider, String providerCustomerId,
                               String providerSubscriptionId, String paymentMethod, LocalDateTime currentPeriodEnd,
                               boolean cancelAtPeriodEnd, String trialPlan, LocalDateTime trialEndsAt, boolean trialUsed,
                               LocalDateTime pastDueSince, LocalDateTime restrictedSince, LocalDateTime pausedUntil) {}

    private final NamedParameterJdbcTemplate jdbc;
    private final MarketRepository markets;
    private final SubscriptionEventService events;
    private final NotificationService notifications;
    private final TransactionTemplate afterCommitTx;

    public SubscriptionService(NamedParameterJdbcTemplate jdbc, MarketRepository markets, SubscriptionEventService events,
                               NotificationService notifications, PlatformTransactionManager txManager) {
        this.jdbc = jdbc;
        this.markets = markets;
        this.events = events;
        this.notifications = notifications;
        this.afterCommitTx = new TransactionTemplate(txManager);
        this.afterCommitTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    // ── Leitura ───────────────────────────────────────────────────────────

    public Settings settings() {
        return jdbc.queryForObject("select trial_days, grace_days, restricted_days from billing_settings where id = 1", Map.of(),
            (rs, i) -> new Settings(rs.getInt("trial_days"), rs.getInt("grace_days"), rs.getInt("restricted_days")));
    }

    @Transactional
    public Settings saveSettings(Map<String, Object> body, String actor) {
        Settings cur = settings();
        int trial = intOr(body.get("trialDays"), cur.trialDays());
        int grace = intOr(body.get("graceDays"), cur.graceDays());
        int restricted = intOr(body.get("restrictedDays"), cur.restrictedDays());
        if (trial < 0 || trial > 60 || grace < 0 || grace > 60 || restricted < 1 || restricted > 365) {
            throw new IllegalArgumentException("Teste e carência de 0 a 60 dias; restrição de 1 a 365 dias.");
        }
        jdbc.update("update billing_settings set trial_days = :t, grace_days = :g, restricted_days = :r, updated_at = now(), "
            + "updated_by = :u where id = 1", new MapSqlParameterSource().addValue("t", trial).addValue("g", grace)
            .addValue("r", restricted).addValue("u", actor));
        return settings();
    }

    /** A assinatura da rede deste mercado (cria a linha do Grátis se ainda não existir). */
    public Subscription of(UUID marketId) {
        UUID root = rootOf(marketId);
        List<Subscription> rows = jdbc.query("select * from subscriptions where market_id = :m", Map.of("m", root), (rs, i) -> map(rs));
        if (!rows.isEmpty()) {
            return rows.get(0);
        }
        Market market = markets.findById(root).orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
        copyFromMarket(market, "criação");
        return jdbc.query("select * from subscriptions where market_id = :m", Map.of("m", root), (rs, i) -> map(rs)).get(0);
    }

    public UUID rootOf(UUID marketId) {
        List<UUID> parent = jdbc.queryForList("select coalesce(parent_market_id, id) from markets where id = :m",
            Map.of("m", marketId), UUID.class);
        return parent.isEmpty() ? marketId : parent.get(0);
    }

    // ── Transições ───────────────────────────────────────────────────────

    /** Teste grátis de um plano pago, uma vez por cliente, sem cartão. */
    @Transactional
    public Subscription startTrial(UUID marketId, PlanType plan, String actor) {
        Subscription s = of(marketId);
        if (plan != PlanType.ESSENCIAL && plan != PlanType.PROFISSIONAL) {
            throw new IllegalArgumentException("O teste grátis vale para o Essencial e o Profissional.");
        }
        if (s.status() != Status.FREE) {
            throw new IllegalStateException("O teste grátis é para quem está no plano Grátis.");
        }
        if (s.trialUsed()) {
            throw new IllegalStateException("Esta conta já usou o teste grátis. Assine para continuar com o plano.");
        }
        int days = settings().trialDays();
        if (days <= 0) {
            throw new IllegalStateException("O teste grátis não está disponível no momento.");
        }
        LocalDateTime ends = LocalDateTime.now().plusDays(days);
        jdbc.update("update subscriptions set status = 'TRIAL', trial_plan = :p, trial_ends_at = :e, trial_used = true, "
            + "updated_at = now() where market_id = :m", new MapSqlParameterSource().addValue("m", s.marketId())
            .addValue("p", plan.name()).addValue("e", Timestamp.valueOf(ends)));
        Subscription after = applyAndRecord(s, "Teste grátis de " + days + " dias (" + actor + ")");
        notifications.notify(s.marketId(), "TRIAL_STARTED", "trial-start:" + ends.toLocalDate(), NotificationService.Severity.INFO,
            "Seu teste do plano " + plan.getDisplayName() + " começou",
            "Você tem " + days + " dias com tudo do plano " + plan.getDisplayName() + ", sem cartão. Termina em " + ends.format(DAY)
                + ". Depois, se não assinar, a conta volta ao Grátis sem perder nada.",
            "Ver planos", "/app/planos", true);
        return after;
    }

    /** Pagamento confirmado pelo meio de cobrança: plano ativo, atraso zerado. */
    @Transactional
    public Subscription paymentConfirmed(UUID marketId, PlanType plan, String provider, String customerId, String subscriptionId,
                                         String paymentMethod, LocalDateTime periodEnd, String reason) {
        Subscription s = of(marketId);
        boolean wasLate = s.status() == Status.PAST_DUE || s.status() == Status.RESTRICTED;
        jdbc.update("update subscriptions set status = 'ACTIVE', plan_code = :p, provider = :pr, "
                + "provider_customer_id = coalesce(:c, provider_customer_id), provider_subscription_id = coalesce(:sid, provider_subscription_id), "
                + "payment_method = coalesce(:pm, payment_method), current_period_end = coalesce(:end, current_period_end), "
                + "past_due_since = null, restricted_since = null, trial_plan = null, trial_ends_at = null, paused_until = null, "
                + "updated_at = now() where market_id = :m",
            new MapSqlParameterSource().addValue("m", s.marketId()).addValue("p", plan.name()).addValue("pr", provider)
                .addValue("c", customerId).addValue("sid", subscriptionId).addValue("pm", paymentMethod)
                .addValue("end", periodEnd == null ? null : Timestamp.valueOf(periodEnd)));
        Subscription after = applyAndRecord(s, reason);
        if (wasLate) {
            notifications.notify(s.marketId(), "PAYMENT_RECOVERED", "recovered:" + LocalDateTime.now().toLocalDate(),
                NotificationService.Severity.INFO, "Pagamento confirmado",
                "Obrigado! A assinatura voltou ao normal e todos os recursos do plano estão liberados.", null, null, true);
        }
        return after;
    }

    /** Cobrança falhou ou venceu: entra em atraso (a data do primeiro atraso não muda). */
    @Transactional
    public Subscription paymentFailed(UUID marketId, String reason) {
        Subscription s = of(marketId);
        if (s.status() != Status.ACTIVE && s.status() != Status.PAST_DUE) {
            return s;
        }
        jdbc.update("update subscriptions set status = 'PAST_DUE', past_due_since = coalesce(past_due_since, now()), "
            + "updated_at = now() where market_id = :m", Map.of("m", s.marketId()));
        Subscription after = applyAndRecord(s, reason);
        if (s.status() == Status.ACTIVE) {
            LocalDateTime limit = LocalDateTime.now().plusDays(settings().graceDays());
            notifications.notify(s.marketId(), "PAYMENT_FAILED", "past-due:" + LocalDateTime.now().toLocalDate(),
                NotificationService.Severity.WARNING, "Não conseguimos confirmar o pagamento da assinatura",
                "Tudo continua funcionando até " + limit.format(DAY) + ". Depois disso, a conta fica só para consulta até o pagamento ser feito.",
                "Pagar agora", "/app/assinatura", true);
        }
        return after;
    }

    /** Cancelamento: imediato (volta ao Grátis) ou no fim do período pago. */
    @Transactional
    public Subscription cancel(UUID marketId, boolean atPeriodEnd, String reason) {
        Subscription s = of(marketId);
        if (atPeriodEnd && s.currentPeriodEnd() != null && s.currentPeriodEnd().isAfter(LocalDateTime.now())) {
            jdbc.update("update subscriptions set cancel_at_period_end = true, updated_at = now() where market_id = :m",
                Map.of("m", s.marketId()));
            return of(s.marketId());
        }
        return toFree(s, reason);
    }

    /**
     * Superadmin ou caminho antigo mudou plano/estado direto no mercado: a assinatura acompanha.
     *
     * Dentro de uma transação, a cópia roda depois do commit, numa transação
     * própria: o chamador ainda segura a linha do mercado e grava eventos em
     * transações separadas, que ficariam esperando por ela.
     */
    public void syncFromMarket(Market market, String reason) {
        UUID id = market.getId();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    TenantContext.runAsSystem(() -> {
                        afterCommitTx.executeWithoutResult(st -> markets.findById(id).ifPresent(m -> copyFromMarket(m, reason)));
                    });
                }
            });
            return;
        }
        TenantContext.runAsSystem(() -> {
            afterCommitTx.executeWithoutResult(st -> markets.findById(id).ifPresent(m -> copyFromMarket(m, reason)));
        });
    }

    private void copyFromMarket(Market market, String reason) {
        Market root = market.getParentMarket() != null ? market.getParentMarket() : market;
        PlanType plan = root.getPlanType() == null ? PlanType.FREE : root.getPlanType();
        MarketBillingStatus b = root.getBillingStatus() == null ? MarketBillingStatus.ACTIVE : root.getBillingStatus();
        Status status = switch (b) {
            case TRIAL -> Status.TRIAL;
            case PAST_DUE -> Status.PAST_DUE;
            case RESTRICTED -> Status.RESTRICTED;
            case SUSPENDED -> Status.SUSPENDED;
            case PENDING -> Status.PENDING;
            case CANCELLED -> Status.CANCELLED;
            case ACTIVE -> plan == PlanType.FREE ? Status.FREE : Status.ACTIVE;
        };
        LocalDateTime trialEnds = b == MarketBillingStatus.TRIAL
            ? (root.getTrialEndsAt() != null ? root.getTrialEndsAt() : LocalDateTime.now().plusDays(settings().trialDays())) : null;
        jdbc.update("insert into subscriptions (market_id, plan_code, status, provider, trial_plan, trial_ends_at, trial_used, past_due_since) "
                + "values (:m, :p, :s, :pr, :tp, :te, :tu, case when :s = 'PAST_DUE' then now() end) "
                + "on conflict (market_id) do update set plan_code = excluded.plan_code, status = excluded.status, "
                + "provider = case when subscriptions.provider = 'NONE' and excluded.status not in ('FREE','TRIAL') then 'MANUAL' else subscriptions.provider end, "
                + "trial_plan = excluded.trial_plan, trial_ends_at = excluded.trial_ends_at, "
                + "trial_used = subscriptions.trial_used or excluded.trial_used, "
                + "past_due_since = case when excluded.status = 'PAST_DUE' then coalesce(subscriptions.past_due_since, now()) end, "
                + "restricted_since = case when excluded.status = 'RESTRICTED' then coalesce(subscriptions.restricted_since, now()) end, "
                + "updated_at = now()",
            new MapSqlParameterSource().addValue("m", root.getId()).addValue("p", plan.name()).addValue("s", status.name())
                .addValue("pr", status == Status.FREE || status == Status.TRIAL ? "NONE" : "MANUAL")
                .addValue("tp", status == Status.TRIAL ? plan.name() : null)
                .addValue("te", trialEnds == null ? null : Timestamp.valueOf(trialEnds))
                .addValue("tu", status == Status.TRIAL));
        log.debug("Assinatura sincronizada do mercado {} ({}): {} {}", root.getId(), reason, status, plan);
    }

    // ── Ciclo diário ─────────────────────────────────────────────────────

    public record LifecycleResult(int trialsEnded, int trialReminders, int restricted, int backToFree, int canceledAtEnd) {}

    /** Roda todo dia: teste que acabou, carência vencida, restrição longa, cancelamento no fim do período. */
    public LifecycleResult runLifecycle() {
        Settings cfg = settings();
        LocalDateTime now = LocalDateTime.now();
        int trialsEnded = 0;
        int reminders = 0;
        int restricted = 0;
        int backToFree = 0;
        int canceled = 0;
        for (Subscription s : list("status = 'TRIAL'")) {
            if (s.trialEndsAt() == null || !s.trialEndsAt().isAfter(now)) {
                toFree(s, "Teste grátis terminou");
                notifications.notify(s.marketId(), "TRIAL_ENDED", "trial-end:" + now.toLocalDate(), NotificationService.Severity.INFO,
                    "Seu teste terminou: a conta voltou ao Grátis",
                    "Nada foi perdido. Para voltar a ter tudo do plano, é só assinar.", "Assinar", "/app/planos", true);
                trialsEnded++;
            } else if (ChronoUnit.HOURS.between(now, s.trialEndsAt()) <= 48) {
                if (notifications.notify(s.marketId(), "TRIAL_ENDING", "trial-ending:" + s.trialEndsAt().toLocalDate(),
                    NotificationService.Severity.WARNING, "Seu teste termina em " + s.trialEndsAt().format(DAY),
                    "Assine para continuar com tudo do plano. Se não assinar, a conta volta ao Grátis sem perder nada.",
                    "Assinar", "/app/planos", true)) {
                    reminders++;
                }
            }
        }
        for (Subscription s : list("status = 'PAST_DUE'")) {
            if (s.pastDueSince() != null && !s.pastDueSince().plusDays(cfg.graceDays()).isAfter(now)) {
                jdbc.update("update subscriptions set status = 'RESTRICTED', restricted_since = now(), updated_at = now() "
                    + "where market_id = :m and status = 'PAST_DUE'", Map.of("m", s.marketId()));
                applyAndRecord(s, "Carência de " + cfg.graceDays() + " dias vencida");
                notifications.notify(s.marketId(), "RESTRICTED", "restricted:" + now.toLocalDate(), NotificationService.Severity.DANGER,
                    "Conta só para consulta: pagamento em aberto",
                    "Os seus dados continuam guardados. Assim que o pagamento for confirmado, tudo volta na hora. Se ficar "
                        + cfg.restrictedDays() + " dias assim, a conta volta ao plano Grátis.",
                    "Pagar agora", "/app/assinatura", true);
                restricted++;
            }
        }
        for (Subscription s : list("status = 'RESTRICTED'")) {
            if (s.restrictedSince() != null && !s.restrictedSince().plusDays(cfg.restrictedDays()).isAfter(now)) {
                toFree(s, "Restrita por " + cfg.restrictedDays() + " dias sem pagamento");
                notifications.notify(s.marketId(), "BACK_TO_FREE", "free:" + now.toLocalDate(), NotificationService.Severity.INFO,
                    "Sua conta voltou ao plano Grátis",
                    "Os dados continuam aqui, nos limites do Grátis. Para voltar ao plano pago, é só assinar de novo.",
                    "Ver planos", "/app/planos", true);
                backToFree++;
            }
        }
        for (Subscription s : list("status = 'ACTIVE' and cancel_at_period_end and current_period_end < now()")) {
            toFree(s, "Cancelada no fim do período pago");
            canceled++;
        }
        return new LifecycleResult(trialsEnded, reminders, restricted, backToFree, canceled);
    }

    // ── Apoio ────────────────────────────────────────────────────────────

    private Subscription toFree(Subscription s, String reason) {
        jdbc.update("update subscriptions set status = 'FREE', plan_code = 'FREE', provider = 'NONE', provider_subscription_id = null, "
            + "current_period_end = null, cancel_at_period_end = false, trial_plan = null, trial_ends_at = null, "
            + "past_due_since = null, restricted_since = null, paused_until = null, updated_at = now() where market_id = :m",
            Map.of("m", s.marketId()));
        return applyAndRecord(s, reason);
    }

    /** Espelha o estado no mercado (e nas filiais) e registra o evento. */
    private Subscription applyAndRecord(Subscription before, String reason) {
        Subscription s = jdbc.query("select * from subscriptions where market_id = :m", Map.of("m", before.marketId()),
            (rs, i) -> map(rs)).get(0);
        PlanType plan = effectivePlan(s);
        MarketBillingStatus billing = mirrorStatus(s.status());
        for (Market m : network(s.marketId())) {
            PlanType fromPlan = m.getPlanType();
            MarketBillingStatus fromStatus = m.getBillingStatus();
            m.setPlanType(plan);
            m.setBillingStatus(billing);
            m.setTrialEndsAt(s.trialEndsAt());
            m.setIsActive(true);
            if (fromPlan != plan) {
                m.setPlanChangedAt(LocalDateTime.now());
            }
            markets.save(m);
            if (m.getId().equals(s.marketId())) {
                if (fromPlan != plan) {
                    events.recordPlanChange(m, fromPlan, plan, reason, null);
                } else if (fromStatus != billing) {
                    events.recordStatusChange(m, fromStatus, billing, reason, null);
                }
            }
        }
        return s;
    }

    /** O plano que vale de fato: no teste, o testado; restrita ou pausada, os limites do Grátis. */
    static PlanType effectivePlan(Subscription s) {
        return switch (s.status()) {
            case TRIAL -> PlanType.fromString(s.trialPlan());
            case ACTIVE, PAST_DUE, SUSPENDED, PENDING, CANCELLED -> PlanType.fromString(s.planCode());
            case FREE, RESTRICTED, PAUSED -> PlanType.FREE;
        };
    }

    static MarketBillingStatus mirrorStatus(Status s) {
        return switch (s) {
            case FREE, ACTIVE, PAUSED -> MarketBillingStatus.ACTIVE;
            case TRIAL -> MarketBillingStatus.TRIAL;
            case PAST_DUE -> MarketBillingStatus.PAST_DUE;
            case RESTRICTED -> MarketBillingStatus.RESTRICTED;
            case SUSPENDED -> MarketBillingStatus.SUSPENDED;
            case PENDING -> MarketBillingStatus.PENDING;
            case CANCELLED -> MarketBillingStatus.CANCELLED;
        };
    }

    private List<Market> network(UUID rootId) {
        List<Market> out = new ArrayList<>();
        markets.findById(rootId).ifPresent(out::add);
        for (UUID id : jdbc.queryForList("select id from markets where parent_market_id = :m", Map.of("m", rootId), UUID.class)) {
            markets.findById(id).ifPresent(out::add);
        }
        return out;
    }

    private List<Subscription> list(String where) {
        return jdbc.query("select * from subscriptions where " + where, Map.of(), (rs, i) -> map(rs));
    }

    private static Subscription map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Subscription((UUID) rs.getObject("market_id"), rs.getString("plan_code"), Status.valueOf(rs.getString("status")),
            rs.getString("provider"), rs.getString("provider_customer_id"), rs.getString("provider_subscription_id"),
            rs.getString("payment_method"), ts(rs.getTimestamp("current_period_end")), rs.getBoolean("cancel_at_period_end"),
            rs.getString("trial_plan"), ts(rs.getTimestamp("trial_ends_at")), rs.getBoolean("trial_used"),
            ts(rs.getTimestamp("past_due_since")), ts(rs.getTimestamp("restricted_since")), ts(rs.getTimestamp("paused_until")));
    }

    private static LocalDateTime ts(Timestamp t) {
        return t == null ? null : t.toLocalDateTime();
    }

    private static int intOr(Object v, int fallback) {
        return v instanceof Number n ? n.intValue() : fallback;
    }
}
