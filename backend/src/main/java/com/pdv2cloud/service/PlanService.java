package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketUsageCounter;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.MarketUsageCounterRepository;
import com.pdv2cloud.repository.PDVRepository;
import com.pdv2cloud.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Limites de plano e medição de uso.
 *
 * Este serviço é a única fonte de verdade sobre "o que este mercado pode
 * fazer". Antes dele, {@code planType} e {@code userSeatLimit} eram gravados no
 * banco mas nunca consultados — o plano não restringia nada.
 *
 * O limite que dispara o upgrade é o volume mensal de notas fiscais: acompanha
 * o faturamento da loja, então um mercado pequeno opera de graça
 * indefinidamente enquanto um maior chega ao teto naturalmente.
 *
 * Ao estourar, a ingestão para mas a leitura continua: o supermercadista não
 * perde o que já coletou, e o histórico segue disponível — o que o pressiona a
 * assinar sem destruir o valor acumulado.
 */
@Service
@Slf4j
public class PlanService {

    private final MarketRepository marketRepository;
    private final MarketUsageCounterRepository usageRepository;
    private final PDVRepository pdvRepository;
    private final UserRepository userRepository;

    public PlanService(
        MarketRepository marketRepository,
        MarketUsageCounterRepository usageRepository,
        PDVRepository pdvRepository,
        UserRepository userRepository
    ) {
        this.marketRepository = marketRepository;
        this.usageRepository = usageRepository;
        this.pdvRepository = pdvRepository;
        this.userRepository = userRepository;
    }

    // ── Limites efetivos ─────────────────────────────────────────────────────

    /**
     * Limites que valem para este mercado, já considerando o plano, eventuais
     * overrides negociados e a flag de conta ilimitada.
     */
    public EffectiveLimits limitsFor(Market market) {
        PlanType plan = market.getPlanType() != null ? market.getPlanType() : PlanType.FREE;

        if (Boolean.TRUE.equals(market.getIsUnlimited())) {
            return new EffectiveLimits(
                plan, PlanType.UNLIMITED, PlanType.UNLIMITED, PlanType.UNLIMITED,
                PlanType.UNLIMITED, true, true
            );
        }

        int invoiceLimit = resolveOverride(market.getInvoiceLimitOverride(), plan.getMonthlyInvoiceLimit());
        int pdvLimit = resolveOverride(market.getPdvLimitOverride(), plan.getPdvLimit());
        // seatLimitOverride tem precedência; userSeatLimit é o campo legado,
        // preenchido em cadastros antigos antes de existir plano de verdade.
        Integer legacySeat = market.getUserSeatLimit();
        int seatLimit = resolveOverride(
            market.getSeatLimitOverride() != null ? market.getSeatLimitOverride() : legacySeat,
            plan.getUserSeatLimit()
        );

        return new EffectiveLimits(
            plan,
            invoiceLimit,
            pdvLimit,
            seatLimit,
            plan.getHistoryRetentionDays(),
            plan.hasFullInsights(),
            false
        );
    }

    @Transactional(readOnly = true)
    public EffectiveLimits limitsFor(UUID marketId) {
        return limitsFor(requireMarket(marketId));
    }

    private static int resolveOverride(Integer override, int planDefault) {
        if (override == null) {
            return planDefault;
        }
        // Override <= 0 significa "sem teto" para este cliente.
        return override <= 0 ? PlanType.UNLIMITED : override;
    }

    // ── Medição de uso ───────────────────────────────────────────────────────

    /** Ciclo corrente: sempre o primeiro dia do mês em curso. */
    public LocalDate currentCycleStart() {
        return LocalDate.now().withDayOfMonth(1);
    }

    @Transactional(readOnly = true)
    public UsageSnapshot usageFor(UUID marketId) {
        Market market = requireMarket(marketId);
        EffectiveLimits limits = limitsFor(market);
        LocalDate cycle = currentCycleStart();

        MarketUsageCounter counter = usageRepository
            .findByMarketIdAndCycleStart(marketId, cycle)
            .orElse(null);

        int used = counter != null ? counter.getInvoicesIngested() : 0;
        int rejected = counter != null ? counter.getInvoicesRejected() : 0;

        long pdvCount = pdvRepository.findByMarketId(marketId).size();
        long seatCount = userRepository.countByMarket_IdAndIsActive(marketId, true);

        return new UsageSnapshot(
            limits,
            cycle,
            cycle.plusMonths(1),
            used,
            rejected,
            (int) pdvCount,
            (int) seatCount,
            counter != null ? counter.getLimitReachedAt() : null
        );
    }

    /**
     * Decide se o mercado ainda pode ingerir uma nota.
     *
     * Roda no caminho quente da ingestão, então evita carregar o mercado
     * inteiro quando o plano já é ilimitado.
     */
    @Transactional(readOnly = true)
    public QuotaDecision canIngest(UUID marketId) {
        Market market = marketRepository.findById(marketId).orElse(null);
        if (market == null) {
            return QuotaDecision.allowed(PlanType.UNLIMITED, 0);
        }

        EffectiveLimits limits = limitsFor(market);
        if (PlanType.isUnlimited(limits.monthlyInvoices())) {
            return QuotaDecision.allowed(PlanType.UNLIMITED, 0);
        }

        LocalDate cycle = currentCycleStart();
        int used = usageRepository.findByMarketIdAndCycleStart(marketId, cycle)
            .map(MarketUsageCounter::getInvoicesIngested)
            .orElse(0);

        if (used >= limits.monthlyInvoices()) {
            return QuotaDecision.denied(limits.monthlyInvoices(), used, limits.plan());
        }
        return QuotaDecision.allowed(limits.monthlyInvoices(), used);
    }

    /**
     * Registra uma nota aceita.
     *
     * Em transação própria (REQUIRES_NEW) para que o contador sobreviva a um
     * rollback do processamento da nota: uma falha no parse não deve zerar a
     * medição do que já entrou.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordIngested(UUID marketId, int itemCount) {
        try {
            usageRepository.incrementIngested(marketId, currentCycleStart(), Math.max(0, itemCount));
        } catch (Exception exc) {
            // Medição nunca deve derrubar a ingestão de uma nota válida.
            log.warn("Falha ao registrar uso do mercado {}: {}", marketId, exc.getMessage());
        }
    }

    /** Registra uma nota recusada por estouro de cota. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordRejected(UUID marketId) {
        try {
            usageRepository.incrementRejected(marketId, currentCycleStart());
        } catch (Exception exc) {
            log.warn("Falha ao registrar recusa do mercado {}: {}", marketId, exc.getMessage());
        }
    }

    // ── Limites estruturais ──────────────────────────────────────────────────

    /** Se o mercado ainda pode cadastrar outro PDV. */
    @Transactional(readOnly = true)
    public QuotaDecision canAddPdv(UUID marketId) {
        EffectiveLimits limits = limitsFor(requireMarket(marketId));
        if (PlanType.isUnlimited(limits.pdvs())) {
            return QuotaDecision.allowed(PlanType.UNLIMITED, 0);
        }
        int current = pdvRepository.findByMarketId(marketId).size();
        return current >= limits.pdvs()
            ? QuotaDecision.denied(limits.pdvs(), current, limits.plan())
            : QuotaDecision.allowed(limits.pdvs(), current);
    }

    /** Se o mercado ainda pode cadastrar outro usuário ativo. */
    @Transactional(readOnly = true)
    public QuotaDecision canAddUser(UUID marketId) {
        EffectiveLimits limits = limitsFor(requireMarket(marketId));
        if (PlanType.isUnlimited(limits.seats())) {
            return QuotaDecision.allowed(PlanType.UNLIMITED, 0);
        }
        int current = (int) userRepository.countByMarket_IdAndIsActive(marketId, true);
        return current >= limits.seats()
            ? QuotaDecision.denied(limits.seats(), current, limits.plan())
            : QuotaDecision.allowed(limits.seats(), current);
    }

    // ── Recorte de listas de inteligência ────────────────────────────────────

    /**
     * Aplica o recorte do plano gratuito às listas de inteligência.
     *
     * O gratuito enxerga o produto inteiro, mas só os
     * {@link PlanType#FREE_INSIGHT_PREVIEW_SIZE} primeiros itens de cada lista:
     * prova o valor sem permitir operar apenas com o gratuito. A lista já chega
     * ordenada por prioridade, então o recorte preserva o que há de mais
     * relevante.
     */
    public <T> InsightSlice<T> sliceInsights(EffectiveLimits limits, List<T> items) {
        if (items == null || items.isEmpty()) {
            return new InsightSlice<>(List.of(), 0, 0, false);
        }
        if (limits.fullInsights()) {
            return new InsightSlice<>(items, items.size(), 0, false);
        }
        int preview = PlanType.FREE_INSIGHT_PREVIEW_SIZE;
        if (items.size() <= preview) {
            return new InsightSlice<>(items, items.size(), 0, false);
        }
        return new InsightSlice<>(
            items.subList(0, preview),
            items.size(),
            items.size() - preview,
            true
        );
    }

    @Transactional(readOnly = true)
    public Optional<Market> findMarket(UUID marketId) {
        return marketRepository.findById(marketId);
    }

    private Market requireMarket(UUID marketId) {
        return marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    public record EffectiveLimits(
        PlanType plan,
        int monthlyInvoices,
        int pdvs,
        int seats,
        int historyDays,
        boolean fullInsights,
        boolean unlimitedAccount
    ) {}

    public record UsageSnapshot(
        EffectiveLimits limits,
        LocalDate cycleStart,
        LocalDate cycleEnd,
        int invoicesUsed,
        int invoicesRejected,
        int pdvCount,
        int seatCount,
        LocalDateTime limitReachedAt
    ) {
        /** 0..100; -1 quando o plano não tem teto. */
        public int usagePercent() {
            if (PlanType.isUnlimited(limits.monthlyInvoices())) {
                return -1;
            }
            if (limits.monthlyInvoices() <= 0) {
                return 100;
            }
            return Math.min(100, (int) Math.round(invoicesUsed * 100.0 / limits.monthlyInvoices()));
        }

        public boolean limitReached() {
            return !PlanType.isUnlimited(limits.monthlyInvoices())
                && invoicesUsed >= limits.monthlyInvoices();
        }

        /** Aviso antecipado, antes de a ingestão travar. */
        public boolean nearLimit() {
            return !limitReached() && usagePercent() >= 80;
        }

        public int remainingInvoices() {
            if (PlanType.isUnlimited(limits.monthlyInvoices())) {
                return -1;
            }
            return Math.max(0, limits.monthlyInvoices() - invoicesUsed);
        }
    }

    public record QuotaDecision(boolean allowed, int limit, int used, PlanType plan, String message) {

        static QuotaDecision allowed(int limit, int used) {
            return new QuotaDecision(true, limit, used, null, null);
        }

        static QuotaDecision denied(int limit, int used, PlanType plan) {
            return new QuotaDecision(false, limit, used, plan, buildMessage(limit, plan));
        }

        private static String buildMessage(int limit, PlanType plan) {
            return String.format(
                "Limite do plano %s atingido (%d por mês). "
                    + "Faça upgrade para continuar — seus dados já coletados seguem disponíveis.",
                plan != null ? plan.getDisplayName() : "atual", limit
            );
        }
    }

    public record InsightSlice<T>(List<T> items, int totalAvailable, int hiddenCount, boolean truncated) {}
}
