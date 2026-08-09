package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanCatalogEntry;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
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
 * Relatórios de faturamento do SaaS.
 *
 * As métricas vêm do banco, não da API do Stripe: são consultadas a cada
 * abertura do painel, e buscar no Stripe a cada vez seria lento e sujeito a
 * rate limit. O banco é atualizado por webhook, então reflete o estado real da
 * cobrança com atraso de segundos.
 */
@Service
@Slf4j
public class BillingReportService {

    private final MarketRepository marketRepository;
    private final PlanCatalogService planCatalogService;

    public BillingReportService(
        MarketRepository marketRepository,
        PlanCatalogService planCatalogService
    ) {
        this.marketRepository = marketRepository;
        this.planCatalogService = planCatalogService;
    }

    @Transactional(readOnly = true)
    public BillingReport build() {
        List<Market> markets = marketRepository.findAll();

        long mrrCents = 0;
        long pastDueCents = 0;
        int payingCount = 0;
        int pastDueCount = 0;
        int cancelingCount = 0;
        int freeCount = 0;
        int trialCount = 0;

        Map<String, PlanRevenue> byPlan = new LinkedHashMap<>();
        List<AccountRevenue> accounts = new ArrayList<>();

        for (Market market : markets) {
            // Filiais não têm assinatura própria: contá-las duplicaria a receita
            // da rede, que é cobrada uma vez na matriz.
            if (market.getParentMarket() != null) {
                continue;
            }

            PlanType plan = market.getPlanType() != null ? market.getPlanType() : PlanType.FREE;
            PlanCatalogEntry entry = planCatalogService.entryFor(plan);

            int priceCents = resolvePrice(market, entry);
            boolean paying = priceCents > 0 && plan != PlanType.FREE;

            if (plan == PlanType.FREE) {
                freeCount++;
            } else if (market.getBillingStatus() == MarketBillingStatus.TRIAL) {
                trialCount++;
            } else if (market.getBillingStatus() == MarketBillingStatus.PAST_DUE) {
                pastDueCount++;
                pastDueCents += priceCents;
            } else if (paying) {
                payingCount++;
                mrrCents += priceCents;
            }

            if (Boolean.TRUE.equals(market.getCancelAtPeriodEnd())) {
                cancelingCount++;
            }

            PlanRevenue revenue = byPlan.computeIfAbsent(
                plan.name(),
                key -> new PlanRevenue(key, entry.getDisplayName(), 0, 0)
            );
            byPlan.put(plan.name(), new PlanRevenue(
                revenue.planCode(),
                revenue.planName(),
                revenue.accounts() + 1,
                revenue.mrrCents() + (paying && market.getBillingStatus() == MarketBillingStatus.ACTIVE
                    ? priceCents : 0)
            ));

            if (paying) {
                accounts.add(new AccountRevenue(
                    market.getId(),
                    market.getName(),
                    plan.name(),
                    entry.getDisplayName(),
                    priceCents,
                    market.getBillingStatus() != null ? market.getBillingStatus().name() : null,
                    market.getStripeSubscriptionId() != null,
                    Boolean.TRUE.equals(market.getCancelAtPeriodEnd()),
                    market.getCurrentPeriodEnd(),
                    market.getCreatedAt()
                ));
            }
        }

        accounts.sort(Comparator.comparingInt(AccountRevenue::monthlyPriceCents).reversed());

        // Contas pagas sem assinatura no Stripe: liberadas à mão ou com a
        // cobrança perdida. É a lista que revela receita que não está entrando.
        List<AccountRevenue> unbilled = accounts.stream()
            .filter(a -> !a.hasStripeSubscription())
            .toList();

        return new BillingReport(
            mrrCents,
            mrrCents * 12L,
            pastDueCents,
            payingCount,
            pastDueCount,
            trialCount,
            freeCount,
            cancelingCount,
            unbilled.size(),
            mrrCents > 0 && payingCount > 0 ? mrrCents / payingCount : 0,
            new ArrayList<>(byPlan.values()),
            accounts.stream().limit(100).toList(),
            unbilled,
            LocalDate.now()
        );
    }

    /**
     * Preço efetivo do mercado.
     *
     * Um plano sob medida (REDE) tem valor negociado em customPriceCents; o
     * catálogo não sabe dizer quanto ele paga.
     */
    private int resolvePrice(Market market, PlanCatalogEntry entry) {
        if (market.getCustomPriceCents() != null && market.getCustomPriceCents() > 0) {
            return market.getCustomPriceCents();
        }
        Integer catalogPrice = entry.getMonthlyPriceCents();
        if (catalogPrice == null || catalogPrice < 0) {
            return 0; // sob consulta: não entra no MRR até ser negociado
        }
        return catalogPrice;
    }

    public record PlanRevenue(String planCode, String planName, int accounts, long mrrCents) {}

    public record AccountRevenue(
        UUID marketId, String marketName,
        String planCode, String planName,
        int monthlyPriceCents, String billingStatus,
        boolean hasStripeSubscription, boolean cancelAtPeriodEnd,
        LocalDateTime currentPeriodEnd, LocalDateTime createdAt
    ) {}

    public record BillingReport(
        long mrrCents,
        long arrCents,
        long pastDueCents,
        int payingAccounts,
        int pastDueAccounts,
        int trialAccounts,
        int freeAccounts,
        int cancelingAccounts,
        /** Contas em plano pago sem assinatura ativa no Stripe. */
        int unbilledAccounts,
        long averageTicketCents,
        List<PlanRevenue> byPlan,
        List<AccountRevenue> topAccounts,
        List<AccountRevenue> unbilled,
        LocalDate generatedAt
    ) {
        public BigDecimal mrr() {
            return BigDecimal.valueOf(mrrCents).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
    }
}
