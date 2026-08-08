package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.MarketUsageCounter;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.SubscriptionEvent;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.MarketUsageCounterRepository;
import com.pdv2cloud.repository.SubscriptionEventRepository;
import com.pdv2cloud.repository.UserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gestão de assinaturas no painel do super admin.
 *
 * Antes existiam apenas criar/listar mercado e trocar status. Faltava tudo que
 * caracteriza a operação de um SaaS: quem está em qual plano, quanto cada um
 * consome, quem está prestes a estourar o limite (o momento certo de abordar
 * para venda), e o histórico do que foi mudado.
 */
@Service
@Slf4j
public class SubscriptionAdminService {

    private final MarketRepository marketRepository;
    private final MarketUsageCounterRepository usageRepository;
    private final SubscriptionEventRepository eventRepository;
    private final UserRepository userRepository;
    private final PlanService planService;
    private final SubscriptionEventService subscriptionEventService;

    public SubscriptionAdminService(
        MarketRepository marketRepository,
        MarketUsageCounterRepository usageRepository,
        SubscriptionEventRepository eventRepository,
        UserRepository userRepository,
        PlanService planService,
        SubscriptionEventService subscriptionEventService
    ) {
        this.marketRepository = marketRepository;
        this.usageRepository = usageRepository;
        this.eventRepository = eventRepository;
        this.userRepository = userRepository;
        this.planService = planService;
        this.subscriptionEventService = subscriptionEventService;
    }

    // ── Catálogo de planos ───────────────────────────────────────────────────

    /** Planos disponíveis com seus limites — alimenta a tela de preços e o painel. */
    public List<PlanDescriptor> listPlans() {
        List<PlanDescriptor> plans = new ArrayList<>();
        for (PlanType plan : PlanType.values()) {
            plans.add(new PlanDescriptor(
                plan.name(),
                plan.getDisplayName(),
                plan.getMonthlyInvoiceLimit(),
                plan.getPdvLimit(),
                plan.getUserSeatLimit(),
                plan.getHistoryRetentionDays(),
                plan.hasFullInsights(),
                marketRepository.countByPlanType(plan)
            ));
        }
        return plans;
    }

    // ── Visão de assinaturas ─────────────────────────────────────────────────

    /**
     * Uma linha por mercado com plano, consumo do ciclo e sinais de venda.
     *
     * Carrega os contadores do ciclo de uma vez e cruza em memória: uma consulta
     * por mercado tornaria a tela lenta assim que a base crescesse.
     */
    @Transactional(readOnly = true)
    public List<SubscriptionRow> listSubscriptions() {
        LocalDate cycle = planService.currentCycleStart();

        Map<UUID, MarketUsageCounter> usageByMarket = usageRepository.findAllForCycle(cycle).stream()
            .collect(java.util.stream.Collectors.toMap(
                counter -> counter.getMarket().getId(),
                counter -> counter,
                (a, b) -> a
            ));

        List<SubscriptionRow> rows = new ArrayList<>();
        for (Market market : marketRepository.findAll()) {
            PlanService.EffectiveLimits limits = planService.limitsFor(market);
            MarketUsageCounter counter = usageByMarket.get(market.getId());

            int used = counter != null ? counter.getInvoicesIngested() : 0;
            int rejected = counter != null ? counter.getInvoicesRejected() : 0;
            int limit = limits.monthlyInvoices();

            int percent = PlanType.isUnlimited(limit)
                ? -1
                : (limit <= 0 ? 100 : Math.min(100, (int) Math.round(used * 100.0 / limit)));

            rows.add(new SubscriptionRow(
                market.getId(),
                market.getName(),
                market.getCnpj(),
                market.getContactEmail(),
                limits.plan().name(),
                limits.plan().getDisplayName(),
                market.getBillingStatus() != null ? market.getBillingStatus().name() : null,
                Boolean.TRUE.equals(market.getIsActive()),
                Boolean.TRUE.equals(market.getIsUnlimited()),
                limit,
                used,
                rejected,
                percent,
                counter != null && counter.getLimitReachedAt() != null,
                (int) userRepository.countByMarket_IdAndIsActive(market.getId(), true),
                limits.seats(),
                limits.pdvs(),
                market.getCreatedAt(),
                market.getPlanChangedAt(),
                counter != null ? counter.getLastIngestAt() : null,
                market.getTrialEndsAt(),
                market.getAccessExpiresAt()
            ));
        }

        // Quem está mais perto do teto primeiro: é a fila de abordagem comercial.
        rows.sort(Comparator.comparingInt(SubscriptionRow::usagePercent).reversed());
        return rows;
    }

    /**
     * Mercados no gratuito que já bateram o limite ou passaram de 80%.
     * É a lista de maior valor comercial do painel.
     */
    @Transactional(readOnly = true)
    public List<SubscriptionRow> listUpgradeCandidates() {
        return listSubscriptions().stream()
            .filter(row -> PlanType.FREE.name().equals(row.planCode()))
            .filter(row -> row.limitReached() || row.usagePercent() >= 80)
            .toList();
    }

    // ── Mutações ─────────────────────────────────────────────────────────────

    @Transactional
    public SubscriptionRow changePlan(UUID marketId, PlanType newPlan, String reason, String actorEmail) {
        Market market = requireMarket(marketId);
        PlanType previous = market.getPlanType();

        if (previous == newPlan) {
            return findRow(marketId);
        }

        market.setPlanType(newPlan);
        market.setPlanChangedAt(LocalDateTime.now());
        // Upgrade a partir do gratuito reativa o acesso: o cliente pagou, não faz
        // sentido continuar bloqueado por um estado antigo.
        if (newPlan != PlanType.FREE && market.getBillingStatus() != MarketBillingStatus.ACTIVE) {
            market.setBillingStatus(MarketBillingStatus.ACTIVE);
            market.setIsActive(true);
        }
        marketRepository.save(market);

        subscriptionEventService.recordPlanChange(market, previous, newPlan, reason, resolveActor(actorEmail));
        log.info("Plano alterado: market={} de={} para={} por={}", marketId, previous, newPlan, actorEmail);
        return findRow(marketId);
    }

    @Transactional
    public SubscriptionRow changeStatus(
        UUID marketId, MarketBillingStatus newStatus, String reason, String actorEmail
    ) {
        Market market = requireMarket(marketId);
        MarketBillingStatus previous = market.getBillingStatus();
        if (previous == newStatus) {
            return findRow(marketId);
        }

        market.setBillingStatus(newStatus);
        // isActive acompanha o status: são consultados juntos em
        // CustomUserDetailsService, e divergir deixaria o acesso inconsistente.
        market.setIsActive(newStatus == MarketBillingStatus.ACTIVE
            || newStatus == MarketBillingStatus.TRIAL);
        marketRepository.save(market);

        subscriptionEventService.recordStatusChange(market, previous, newStatus, reason, resolveActor(actorEmail));
        return findRow(marketId);
    }

    /** Limites negociados para um cliente específico. Null restaura o padrão do plano. */
    @Transactional
    public SubscriptionRow updateLimits(
        UUID marketId,
        Integer invoiceLimit,
        Integer pdvLimit,
        Integer seatLimit,
        Boolean unlimited,
        String reason,
        String actorEmail
    ) {
        Market market = requireMarket(marketId);
        market.setInvoiceLimitOverride(invoiceLimit);
        market.setPdvLimitOverride(pdvLimit);
        market.setSeatLimitOverride(seatLimit);
        if (unlimited != null) {
            market.setIsUnlimited(unlimited);
        }
        market.setPlanNotes(reason);
        marketRepository.save(market);

        subscriptionEventService.recordLimitOverride(market, reason, resolveActor(actorEmail));
        return findRow(marketId);
    }

    // ── Métricas agregadas ───────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public SubscriptionMetrics metrics() {
        List<SubscriptionRow> rows = listSubscriptions();

        long free = rows.stream().filter(r -> PlanType.FREE.name().equals(r.planCode())).count();
        long pro = rows.stream().filter(r -> PlanType.PRO.name().equals(r.planCode())).count();
        long enterprise = rows.stream().filter(r -> PlanType.ENTERPRISE.name().equals(r.planCode())).count();

        long active = rows.stream().filter(SubscriptionRow::active).count();
        long atLimit = rows.stream().filter(SubscriptionRow::limitReached).count();
        long nearLimit = rows.stream()
            .filter(r -> !r.limitReached() && r.usagePercent() >= 80)
            .count();

        long totalInvoices = rows.stream().mapToLong(SubscriptionRow::invoicesUsed).sum();
        long rejected = rows.stream().mapToLong(SubscriptionRow::invoicesRejected).sum();

        long paying = pro + enterprise;
        BigDecimal conversionRate = rows.isEmpty()
            ? BigDecimal.ZERO
            : BigDecimal.valueOf(paying)
                .divide(BigDecimal.valueOf(rows.size()), 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(2, RoundingMode.HALF_UP);

        return new SubscriptionMetrics(
            rows.size(), active, free, pro, enterprise,
            atLimit, nearLimit, totalInvoices, rejected, conversionRate
        );
    }

    @Transactional(readOnly = true)
    public List<SubscriptionEvent> historyFor(UUID marketId) {
        return eventRepository.findTop50ByMarketIdOrderByCreatedAtDesc(marketId);
    }

    @Transactional(readOnly = true)
    public List<MarketUsageCounter> usageHistoryFor(UUID marketId) {
        return usageRepository.findByMarketIdOrderByCycleStartDesc(marketId);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private SubscriptionRow findRow(UUID marketId) {
        return listSubscriptions().stream()
            .filter(row -> row.marketId().equals(marketId))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
    }

    private Market requireMarket(UUID marketId) {
        return marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
    }

    private User resolveActor(String actorEmail) {
        if (actorEmail == null || actorEmail.isBlank()) {
            return null;
        }
        return userRepository.findForAuthenticationByEmail(actorEmail).orElse(null);
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    public record PlanDescriptor(
        String code, String name,
        int monthlyInvoices, int pdvs, int seats, int historyDays,
        boolean fullInsights, long marketCount
    ) {}

    public record SubscriptionRow(
        UUID marketId, String marketName, String cnpj, String contactEmail,
        String planCode, String planName, String billingStatus,
        boolean active, boolean unlimited,
        int invoiceLimit, int invoicesUsed, int invoicesRejected, int usagePercent,
        boolean limitReached,
        int seatCount, int seatLimit, int pdvLimit,
        LocalDateTime createdAt, LocalDateTime planChangedAt, LocalDateTime lastIngestAt,
        LocalDateTime trialEndsAt, LocalDateTime accessExpiresAt
    ) {}

    public record SubscriptionMetrics(
        int totalMarkets, long activeMarkets,
        long freeMarkets, long proMarkets, long enterpriseMarkets,
        long marketsAtLimit, long marketsNearLimit,
        long invoicesThisCycle, long invoicesRejectedThisCycle,
        BigDecimal conversionRatePercent
    ) {}
}
