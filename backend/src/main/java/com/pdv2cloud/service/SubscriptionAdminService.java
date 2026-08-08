package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.MarketUsageCounter;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.SubscriptionEvent;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.MarketUsageCounterRepository;
import com.pdv2cloud.repository.PDVRepository;
import com.pdv2cloud.repository.SubscriptionEventRepository;
import com.pdv2cloud.repository.UserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
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
    private final PDVRepository pdvRepository;
    private final PlanService planService;
    private final SubscriptionEventService subscriptionEventService;

    public SubscriptionAdminService(
        MarketRepository marketRepository,
        MarketUsageCounterRepository usageRepository,
        SubscriptionEventRepository eventRepository,
        UserRepository userRepository,
        PDVRepository pdvRepository,
        PlanService planService,
        SubscriptionEventService subscriptionEventService
    ) {
        this.marketRepository = marketRepository;
        this.usageRepository = usageRepository;
        this.eventRepository = eventRepository;
        this.userRepository = userRepository;
        this.pdvRepository = pdvRepository;
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
                plan.getMonthlyPriceCents(),
                plan.getMonthlyInvoiceLimit(),
                plan.getBranchLimit(),
                plan.getPdvPerBranchLimit(),
                plan.getPdvLimit(),
                plan.getUserSeatLimit(),
                plan.getHistoryRetentionDays(),
                plan.hasFullInsights(),
                plan.isCustom(),
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
                pdvRepository.findByMarketId(market.getId()).size(),
                limits.pdvs(),
                (int) marketRepository.countNetworkMembers(limits.networkRootId()),
                limits.branches(),
                market.getParentMarket() != null ? market.getParentMarket().getId() : null,
                market.getParentMarket() != null ? market.getParentMarket().getName() : null,
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
        Integer branchLimit,
        Integer pdvPerBranchLimit,
        Integer pdvLimit,
        Integer seatLimit,
        Integer customPriceCents,
        Boolean unlimited,
        String reason,
        String actorEmail
    ) {
        Market market = requireMarket(marketId);
        market.setInvoiceLimitOverride(invoiceLimit);
        market.setBranchLimitOverride(branchLimit);
        market.setPdvPerBranchOverride(pdvPerBranchLimit);
        market.setPdvLimitOverride(pdvLimit);
        market.setSeatLimitOverride(seatLimit);
        market.setCustomPriceCents(customPriceCents);
        if (unlimited != null) {
            market.setIsUnlimited(unlimited);
        }
        market.setPlanNotes(reason);
        marketRepository.save(market);

        subscriptionEventService.recordLimitOverride(market, reason, resolveActor(actorEmail));
        return findRow(marketId);
    }

    // ── Gestão de rede ───────────────────────────────────────────────────────

    /**
     * Vincula um mercado como filial de outro.
     *
     * É a saída oferecida à rede que tentou se cadastrar fatiada: em vez de N
     * contas soltas, uma matriz com filiais, cujos limites passam a ser
     * apurados em conjunto.
     */
    @Transactional
    public SubscriptionRow attachBranch(UUID parentMarketId, UUID branchMarketId, String actorEmail) {
        if (parentMarketId.equals(branchMarketId)) {
            throw new IllegalArgumentException("Um mercado não pode ser filial de si mesmo");
        }

        Market parent = requireMarket(parentMarketId);
        Market branch = requireMarket(branchMarketId);

        if (parent.getParentMarket() != null) {
            throw new IllegalArgumentException(
                "A matriz indicada já é filial de outra rede. Vincule à matriz principal.");
        }
        if (!marketRepository.findByParentMarketId(branchMarketId).isEmpty()) {
            throw new IllegalArgumentException(
                "Este mercado já é matriz de outras lojas. Desvincule-as antes.");
        }

        branch.setParentMarket(parent);
        // A filial passa a consumir a assinatura da matriz: manter plano próprio
        // faria a mesma loja ser contada duas vezes nas métricas.
        branch.setPlanType(parent.getPlanType());
        marketRepository.save(branch);

        subscriptionEventService.recordPlanChange(
            branch, branch.getPlanType(), parent.getPlanType(),
            "Vinculado como filial de " + parent.getName(), resolveActor(actorEmail)
        );
        return findRow(parentMarketId);
    }

    @Transactional
    public SubscriptionRow detachBranch(UUID branchMarketId, String actorEmail) {
        Market branch = requireMarket(branchMarketId);
        if (branch.getParentMarket() == null) {
            throw new IllegalArgumentException("Este mercado não é filial de ninguém");
        }
        String parentName = branch.getParentMarket().getName();
        branch.setParentMarket(null);
        marketRepository.save(branch);

        subscriptionEventService.recordPlanChange(
            branch, branch.getPlanType(), branch.getPlanType(),
            "Desvinculado da rede " + parentName, resolveActor(actorEmail)
        );
        return findRow(branchMarketId);
    }

    /** Lojas de uma rede: a matriz e suas filiais. */
    @Transactional(readOnly = true)
    public List<NetworkMember> networkOf(UUID marketId) {
        Market market = requireMarket(marketId);
        UUID rootId = market.getParentMarket() != null
            ? market.getParentMarket().getId()
            : market.getId();

        List<NetworkMember> members = new ArrayList<>();
        for (Market member : marketRepository.findNetwork(rootId)) {
            members.add(new NetworkMember(
                member.getId(),
                member.getName(),
                member.getBranchLabel(),
                member.getCnpj(),
                member.getParentMarket() == null,
                pdvRepository.findByMarketId(member.getId()).size(),
                (int) userRepository.countByMarket_IdAndIsActive(member.getId(), true),
                member.getCreatedAt()
            ));
        }
        return members;
    }

    /**
     * Empresas com mais de uma conta e sem vínculo de rede.
     *
     * São as redes que se fatiaram antes de o bloqueio por CNPJ raiz existir —
     * e cada uma delas é uma conversa comercial em aberto.
     */
    @Transactional(readOnly = true)
    public List<SuspectedNetwork> listSuspectedNetworks() {
        Map<String, List<Market>> byRoot = new LinkedHashMap<>();
        for (Market market : marketRepository.findAll()) {
            String root = market.getCnpjRoot();
            if (root == null || root.isBlank()) {
                continue;
            }
            byRoot.computeIfAbsent(root, key -> new ArrayList<>()).add(market);
        }

        List<SuspectedNetwork> suspected = new ArrayList<>();
        for (Map.Entry<String, List<Market>> entry : byRoot.entrySet()) {
            List<Market> accounts = entry.getValue();
            if (accounts.size() < 2) {
                continue;
            }
            // Já vinculadas não são suspeitas: a rede está corretamente modelada.
            long unlinked = accounts.stream().filter(m -> m.getParentMarket() == null).count();
            if (unlinked < 2) {
                continue;
            }

            int totalPdvs = 0;
            for (Market account : accounts) {
                totalPdvs += pdvRepository.findByMarketId(account.getId()).size();
            }

            suspected.add(new SuspectedNetwork(
                entry.getKey(),
                accounts.size(),
                (int) unlinked,
                totalPdvs,
                accounts.stream()
                    .map(m -> new NetworkMember(
                        m.getId(), m.getName(), m.getBranchLabel(), m.getCnpj(),
                        m.getParentMarket() == null,
                        pdvRepository.findByMarketId(m.getId()).size(),
                        (int) userRepository.countByMarket_IdAndIsActive(m.getId(), true),
                        m.getCreatedAt()
                    ))
                    .toList()
            ));
        }

        suspected.sort(Comparator.comparingInt(SuspectedNetwork::accountCount).reversed());
        return suspected;
    }

    // ── Métricas agregadas ───────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public SubscriptionMetrics metrics() {
        List<SubscriptionRow> rows = listSubscriptions();

        long free = rows.stream().filter(r -> PlanType.FREE.name().equals(r.planCode())).count();
        long essencial = rows.stream().filter(r -> PlanType.ESSENCIAL.name().equals(r.planCode())).count();
        long profissional = rows.stream().filter(r -> PlanType.PROFISSIONAL.name().equals(r.planCode())).count();
        long rede = rows.stream().filter(r -> PlanType.REDE.name().equals(r.planCode())).count();

        long active = rows.stream().filter(SubscriptionRow::active).count();
        long atLimit = rows.stream().filter(SubscriptionRow::limitReached).count();
        long nearLimit = rows.stream()
            .filter(r -> !r.limitReached() && r.usagePercent() >= 80)
            .count();

        long totalInvoices = rows.stream().mapToLong(SubscriptionRow::invoicesUsed).sum();
        long rejected = rows.stream().mapToLong(SubscriptionRow::invoicesRejected).sum();

        long paying = essencial + profissional + rede;
        BigDecimal conversionRate = rows.isEmpty()
            ? BigDecimal.ZERO
            : BigDecimal.valueOf(paying)
                .divide(BigDecimal.valueOf(rows.size()), 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(2, RoundingMode.HALF_UP);

        return new SubscriptionMetrics(
            rows.size(), active, free, essencial, profissional, rede,
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
        int monthlyPriceCents,
        int monthlyInvoices, int branches, int pdvsPerBranch, int pdvs, int seats,
        int historyDays, boolean fullInsights, boolean custom, long marketCount
    ) {}

    public record NetworkMember(
        UUID marketId, String name, String branchLabel, String cnpj,
        boolean headquarters, int pdvCount, int seatCount, LocalDateTime createdAt
    ) {}

    /** Empresa com várias contas soltas — candidata a virar rede formal. */
    public record SuspectedNetwork(
        String cnpjRoot, int accountCount, int unlinkedCount, int totalPdvs,
        List<NetworkMember> accounts
    ) {}

    public record SubscriptionRow(
        UUID marketId, String marketName, String cnpj, String contactEmail,
        String planCode, String planName, String billingStatus,
        boolean active, boolean unlimited,
        int invoiceLimit, int invoicesUsed, int invoicesRejected, int usagePercent,
        boolean limitReached,
        int seatCount, int seatLimit, int pdvCount, int pdvLimit,
        /** Lojas na rede, contando a matriz. */
        int branchCount, int branchLimit,
        /** Preenchido quando este mercado e filial de outro. */
        UUID parentMarketId, String parentMarketName,
        LocalDateTime createdAt, LocalDateTime planChangedAt, LocalDateTime lastIngestAt,
        LocalDateTime trialEndsAt, LocalDateTime accessExpiresAt
    ) {}

    public record SubscriptionMetrics(
        int totalMarkets, long activeMarkets,
        long freeMarkets, long essencialMarkets, long profissionalMarkets, long redeMarkets,
        long marketsAtLimit, long marketsNearLimit,
        long invoicesThisCycle, long invoicesRejectedThisCycle,
        BigDecimal conversionRatePercent
    ) {}
}
