package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketUsageCounter;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.MarketUsageCounterRepository;
import com.pdv2cloud.repository.PDVRepository;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.util.CnpjUtils;
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
 * Única fonte de verdade sobre "o que esta empresa pode fazer". Antes dele,
 * {@code planType} e {@code userSeatLimit} eram gravados mas nunca consultados.
 *
 * Ponto central do desenho: todo limite é apurado sobre a REDE inteira — matriz
 * mais filiais — e não por conta. Uma rede que abre uma conta por loja continua
 * somando contra o mesmo teto, então fatiar-se não contorna nada. Os tetos são
 * três e se cobrem mutuamente:
 *
 *   filiais            impede a rede de crescer em número de lojas;
 *   PDVs por filial    impede concentrar dezenas de caixas numa loja só;
 *   PDVs no total      impede distribuir muitos caixas em várias lojas.
 *
 * Ao estourar o volume mensal a ingestão para, mas a leitura continua: o
 * supermercadista não perde o que já coletou, o que o pressiona a assinar sem
 * destruir o valor acumulado.
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

    // ── Rede ─────────────────────────────────────────────────────────────────

    /**
     * Matriz da rede a que este mercado pertence.
     *
     * O plano e os limites vivem sempre na matriz: uma filial não tem assinatura
     * própria, ela consome a da rede.
     */
    @Transactional(readOnly = true)
    public Market networkRootOf(Market market) {
        return market.getParentMarket() != null ? market.getParentMarket() : market;
    }

    /** Todos os mercados da rede (matriz + filiais). */
    @Transactional(readOnly = true)
    public List<Market> networkOf(UUID marketId) {
        Market market = requireMarket(marketId);
        return marketRepository.findNetwork(networkRootOf(market).getId());
    }

    // ── Limites efetivos ─────────────────────────────────────────────────────

    /**
     * Limites válidos para a rede deste mercado, considerando plano, overrides
     * negociados e a flag de conta ilimitada.
     */
    @Transactional(readOnly = true)
    public EffectiveLimits limitsFor(Market market) {
        Market root = networkRootOf(market);
        PlanType plan = root.getPlanType() != null ? root.getPlanType() : PlanType.FREE;

        if (Boolean.TRUE.equals(root.getIsUnlimited())) {
            return new EffectiveLimits(
                plan, PlanType.UNLIMITED, PlanType.UNLIMITED, PlanType.UNLIMITED,
                PlanType.UNLIMITED, PlanType.UNLIMITED, true, true, root.getId()
            );
        }

        int invoiceLimit = resolveOverride(root.getInvoiceLimitOverride(), plan.getMonthlyInvoiceLimit());
        int branchLimit = resolveOverride(root.getBranchLimitOverride(), plan.getBranchLimit());
        int pdvPerBranch = resolveOverride(root.getPdvPerBranchOverride(), plan.getPdvPerBranchLimit());
        int pdvLimit = resolveOverride(root.getPdvLimitOverride(), plan.getPdvLimit());

        // seatLimitOverride tem precedência; userSeatLimit é o campo legado,
        // preenchido em cadastros antigos antes de existir plano de verdade.
        Integer legacySeat = root.getUserSeatLimit();
        int seatLimit = resolveOverride(
            root.getSeatLimitOverride() != null ? root.getSeatLimitOverride() : legacySeat,
            plan.getUserSeatLimit()
        );

        return new EffectiveLimits(
            plan, invoiceLimit, branchLimit, pdvPerBranch, pdvLimit, seatLimit,
            plan.getHistoryRetentionDays(), plan.hasFullInsights(), root.getId()
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

    /**
     * Notas ingeridas no ciclo por toda a rede.
     *
     * Somar as filiais é o que impede o contorno mais óbvio: sem isso, cada loja
     * teria o teto cheio para si.
     */
    @Transactional(readOnly = true)
    public int networkInvoicesThisCycle(UUID rootId) {
        LocalDate cycle = currentCycleStart();
        int total = 0;
        for (Market member : marketRepository.findNetwork(rootId)) {
            total += usageRepository.findByMarketIdAndCycleStart(member.getId(), cycle)
                .map(MarketUsageCounter::getInvoicesIngested)
                .orElse(0);
        }
        return total;
    }

    @Transactional(readOnly = true)
    public UsageSnapshot usageFor(UUID marketId) {
        Market market = requireMarket(marketId);
        EffectiveLimits limits = limitsFor(market);
        LocalDate cycle = currentCycleStart();

        List<Market> network = marketRepository.findNetwork(limits.networkRootId());

        int used = 0;
        int rejected = 0;
        int pdvCount = 0;
        int seatCount = 0;
        LocalDateTime limitReachedAt = null;

        for (Market member : network) {
            MarketUsageCounter counter = usageRepository
                .findByMarketIdAndCycleStart(member.getId(), cycle)
                .orElse(null);
            if (counter != null) {
                used += counter.getInvoicesIngested();
                rejected += counter.getInvoicesRejected();
                if (counter.getLimitReachedAt() != null
                    && (limitReachedAt == null || counter.getLimitReachedAt().isBefore(limitReachedAt))) {
                    limitReachedAt = counter.getLimitReachedAt();
                }
            }
            pdvCount += pdvRepository.findByMarketId(member.getId()).size();
            seatCount += (int) userRepository.countByMarket_IdAndIsActive(member.getId(), true);
        }

        return new UsageSnapshot(
            limits, cycle, cycle.plusMonths(1),
            used, rejected, network.size(), pdvCount, seatCount, limitReachedAt
        );
    }

    /**
     * Decide se o mercado ainda pode ingerir uma nota. Roda no caminho quente da
     * ingestão, então evita trabalho quando o plano já é ilimitado.
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

        int used = networkInvoicesThisCycle(limits.networkRootId());
        if (used >= limits.monthlyInvoices()) {
            return QuotaDecision.denied(limits.monthlyInvoices(), used, limits.plan(),
                String.format(
                    "Limite do plano %s atingido (%d notas por mês na rede). "
                        + "Faça upgrade para continuar — seus dados já coletados seguem disponíveis.",
                    limits.plan().getDisplayName(), limits.monthlyInvoices()
                ));
        }
        return QuotaDecision.allowed(limits.monthlyInvoices(), used);
    }

    /**
     * Registra uma nota aceita.
     *
     * Em transação própria (REQUIRES_NEW) para que o contador sobreviva a um
     * rollback do processamento: uma falha no parse não deve zerar a medição do
     * que já entrou.
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

    /**
     * Se ainda cabe outro PDV nesta loja.
     *
     * Checa os dois tetos: o da loja e o da rede. Passar em apenas um não basta
     * — é justamente a combinação que impede a rede de se acomodar num plano
     * barato distribuindo caixas entre muitas lojas.
     */
    @Transactional(readOnly = true)
    public QuotaDecision canAddPdv(UUID marketId) {
        Market market = requireMarket(marketId);
        EffectiveLimits limits = limitsFor(market);

        int inThisBranch = pdvRepository.findByMarketId(marketId).size();
        if (!PlanType.isUnlimited(limits.pdvsPerBranch()) && inThisBranch >= limits.pdvsPerBranch()) {
            return QuotaDecision.denied(limits.pdvsPerBranch(), inThisBranch, limits.plan(),
                String.format(
                    "Seu plano %s permite %d PDV(s) por loja e esta já tem %d. "
                        + "Faça upgrade para conectar mais caixas nesta loja.",
                    limits.plan().getDisplayName(), limits.pdvsPerBranch(), inThisBranch
                ));
        }

        if (!PlanType.isUnlimited(limits.pdvs())) {
            int inNetwork = 0;
            for (Market member : marketRepository.findNetwork(limits.networkRootId())) {
                inNetwork += pdvRepository.findByMarketId(member.getId()).size();
            }
            if (inNetwork >= limits.pdvs()) {
                return QuotaDecision.denied(limits.pdvs(), inNetwork, limits.plan(),
                    String.format(
                        "Seu plano %s permite %d PDV(s) somando todas as lojas e já há %d. "
                            + "Fale com o comercial para um plano sob medida.",
                        limits.plan().getDisplayName(), limits.pdvs(), inNetwork
                    ));
            }
        }

        return QuotaDecision.allowed(limits.pdvs(), inThisBranch);
    }

    /** Se a rede ainda pode abrir outra loja. */
    @Transactional(readOnly = true)
    public QuotaDecision canAddBranch(UUID marketId) {
        Market market = requireMarket(marketId);
        EffectiveLimits limits = limitsFor(market);
        if (PlanType.isUnlimited(limits.branches())) {
            return QuotaDecision.allowed(PlanType.UNLIMITED, 0);
        }

        int current = (int) marketRepository.countNetworkMembers(limits.networkRootId());
        if (current >= limits.branches()) {
            return QuotaDecision.denied(limits.branches(), current, limits.plan(),
                String.format(
                    "Seu plano %s permite %d loja(s) e a rede já tem %d. "
                        + "Fale com o comercial para um plano sob medida para redes.",
                    limits.plan().getDisplayName(), limits.branches(), current
                ));
        }
        return QuotaDecision.allowed(limits.branches(), current);
    }

    /** Se a rede ainda pode cadastrar outro usuário ativo. */
    @Transactional(readOnly = true)
    public QuotaDecision canAddUser(UUID marketId) {
        Market market = requireMarket(marketId);
        EffectiveLimits limits = limitsFor(market);
        if (PlanType.isUnlimited(limits.seats())) {
            return QuotaDecision.allowed(PlanType.UNLIMITED, 0);
        }

        int current = 0;
        for (Market member : marketRepository.findNetwork(limits.networkRootId())) {
            current += (int) userRepository.countByMarket_IdAndIsActive(member.getId(), true);
        }
        if (current >= limits.seats()) {
            return QuotaDecision.denied(limits.seats(), current, limits.plan(),
                String.format(
                    "Seu plano %s permite %d usuário(s) na rede e já há %d.",
                    limits.plan().getDisplayName(), limits.seats(), current
                ));
        }
        return QuotaDecision.allowed(limits.seats(), current);
    }

    // ── Anti-fatiamento de rede ──────────────────────────────────────────────

    /**
     * Contas já existentes da mesma empresa (mesmo CNPJ raiz).
     *
     * Usado no cadastro para recusar a segunda conta de uma rede que tenta se
     * fatiar, e no painel do super admin para achar as que entraram antes desta
     * regra existir.
     */
    @Transactional(readOnly = true)
    public List<Market> findSameCompanyAccounts(String cnpj) {
        String root = CnpjUtils.root(cnpj);
        if (root == null) {
            return List.of();
        }
        return marketRepository.findByCnpjRoot(root);
    }

    @Transactional(readOnly = true)
    public Optional<Market> findMarket(UUID marketId) {
        return marketRepository.findById(marketId);
    }

    // ── Recorte de listas de inteligência ────────────────────────────────────

    /**
     * Aplica o recorte do plano gratuito às listas de inteligência.
     *
     * O gratuito enxerga o produto inteiro, mas só os
     * {@link PlanType#FREE_INSIGHT_PREVIEW_SIZE} primeiros itens de cada lista.
     * A lista já chega ordenada por prioridade, então o recorte preserva o que
     * há de mais relevante.
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
            items.subList(0, preview), items.size(), items.size() - preview, true
        );
    }

    private Market requireMarket(UUID marketId) {
        return marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    public record EffectiveLimits(
        PlanType plan,
        int monthlyInvoices,
        int branches,
        int pdvsPerBranch,
        int pdvs,
        int seats,
        int historyDays,
        boolean fullInsights,
        /** Matriz cuja assinatura vale para toda a rede. */
        UUID networkRootId
    ) {
        /** Construtor para contas isentas de teto. */
        EffectiveLimits(
            PlanType plan, int invoices, int branches, int pdvsPerBranch, int pdvs, int seats,
            boolean fullInsights, boolean unlimitedAccount, UUID networkRootId
        ) {
            this(plan, invoices, branches, pdvsPerBranch, pdvs, seats,
                PlanType.UNLIMITED, fullInsights, networkRootId);
        }
    }

    public record UsageSnapshot(
        EffectiveLimits limits,
        LocalDate cycleStart,
        LocalDate cycleEnd,
        int invoicesUsed,
        int invoicesRejected,
        int branchCount,
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

        static QuotaDecision denied(int limit, int used, PlanType plan, String message) {
            return new QuotaDecision(false, limit, used, plan, message);
        }
    }

    public record InsightSlice<T>(List<T> items, int totalAvailable, int hiddenCount, boolean truncated) {}
}
