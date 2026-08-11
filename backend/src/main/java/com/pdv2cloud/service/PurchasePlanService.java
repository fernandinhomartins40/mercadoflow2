package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.ProductCapitalMetric.CapitalStatus;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import com.pdv2cloud.service.intelligence.CapitalMetricsReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Plano de compra: transforma as métricas de capital em uma decisão concreta.
 *
 * O supermercadista chega com um valor disponível para comprar. Este serviço
 * responde: comprando o quê, em que quantidade, e por quê — priorizando os
 * produtos cujo real investido volta mais rápido e com mais margem, e apontando
 * separadamente o capital que já está preso em produtos que pararam de girar.
 *
 * A alocação é gulosa por eficiência de capital (margem esperada por real
 * investido), o que resolve bem o problema prático: com orçamento limitado,
 * comprar primeiro o que devolve mais por real. Não tenta ser um solver de
 * mochila — a precisão extra não compensaria diante do erro do estoque
 * estimado, que é a fonte de incerteza dominante aqui.
 */
@Service
@Slf4j
public class PurchasePlanService {

    /** Sem custo registrado não dá para alocar orçamento com honestidade. */
    private static final BigDecimal MIN_ALLOCATABLE_VALUE = BigDecimal.valueOf(0.01);

    private final CapitalMetricsReader capitalMetricsReader;

    public PurchasePlanService(CapitalMetricsReader capitalMetricsReader) {
        this.capitalMetricsReader = capitalMetricsReader;
    }

    /**
     * Monta o plano de compra para o orçamento informado.
     *
     * @param budget orçamento disponível; se nulo ou zero, devolve o plano
     *               completo sem corte, para o usuário ver o total necessário.
     */
    @Transactional(readOnly = true)
    public PurchasePlan buildPlan(UUID marketId, BigDecimal budget, int windowDays) {
        List<CapitalMetric> portfolio = capitalMetricsReader.portfolio(marketId, windowDays);
        if (portfolio.isEmpty()) {
            return PurchasePlan.empty();
        }

        // Candidatos: precisam de reposição e têm custo conhecido.
        List<CapitalMetric> candidates = portfolio.stream()
            .filter(m -> m.suggestedOrderUnits() != null && m.suggestedOrderUnits().signum() > 0)
            .filter(m -> m.capitalStatus() != CapitalStatus.LIQUIDAR)
            .filter(m -> m.suggestedOrderValue() != null
                && m.suggestedOrderValue().compareTo(MIN_ALLOCATABLE_VALUE) >= 0)
            .sorted(Comparator.comparing(PurchasePlanService::capitalEfficiency).reversed())
            .toList();

        List<PurchaseLine> selected = new ArrayList<>();
        List<PurchaseLine> deferred = new ArrayList<>();

        boolean hasBudget = budget != null && budget.signum() > 0;
        BigDecimal remaining = hasBudget ? budget : null;
        BigDecimal allocated = BigDecimal.ZERO;
        BigDecimal expectedMargin = BigDecimal.ZERO;

        for (CapitalMetric metric : candidates) {
            BigDecimal lineValue = metric.suggestedOrderValue();
            BigDecimal lineUnits = metric.suggestedOrderUnits();

            if (hasBudget) {
                if (remaining.compareTo(MIN_ALLOCATABLE_VALUE) < 0) {
                    deferred.add(toLine(metric, lineUnits, lineValue, false));
                    continue;
                }
                if (lineValue.compareTo(remaining) > 0) {
                    // Cabe parcialmente: compra o que o orçamento permite em vez
                    // de descartar o item inteiro — é o que o comprador faria.
                    BigDecimal ratio = remaining.divide(lineValue, 6, RoundingMode.DOWN);
                    BigDecimal partialUnits = lineUnits.multiply(ratio).setScale(3, RoundingMode.DOWN);
                    if (partialUnits.signum() <= 0) {
                        deferred.add(toLine(metric, lineUnits, lineValue, false));
                        continue;
                    }
                    BigDecimal partialValue = metric.unitCost() != null
                        ? partialUnits.multiply(metric.unitCost()).setScale(2, RoundingMode.HALF_UP)
                        : remaining;
                    lineUnits = partialUnits;
                    lineValue = partialValue;
                }
                remaining = remaining.subtract(lineValue);
            }

            allocated = allocated.add(lineValue);
            expectedMargin = expectedMargin.add(expectedMarginFor(metric, lineUnits));
            selected.add(toLine(metric, lineUnits, lineValue, true));
        }

        // Capital preso: o que já foi comprado e parou de girar.
        List<PurchaseLine> frozen = portfolio.stream()
            .filter(m -> m.capitalStatus() == CapitalStatus.LIQUIDAR
                || m.capitalStatus() == CapitalStatus.REDUZIR)
            .filter(m -> m.inventoryValue() != null && m.inventoryValue().signum() > 0)
            .sorted(Comparator.comparing(CapitalMetric::inventoryValue).reversed())
            .limit(50)
            .map(m -> toLine(m, m.inventoryUnits(), m.inventoryValue(), false))
            .toList();

        BigDecimal frozenCapital = frozen.stream()
            .map(PurchaseLine::value)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalNeeded = candidates.stream()
            .map(CapitalMetric::suggestedOrderValue)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new PurchasePlan(
            budget,
            allocated.setScale(2, RoundingMode.HALF_UP),
            hasBudget ? remaining.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP) : null,
            totalNeeded.setScale(2, RoundingMode.HALF_UP),
            expectedMargin.setScale(2, RoundingMode.HALF_UP),
            expectedReturnRate(allocated, expectedMargin),
            frozenCapital.setScale(2, RoundingMode.HALF_UP),
            selected,
            deferred,
            frozen,
            buildSummary(portfolio)
        );
    }

    /**
     * Eficiência do capital: margem esperada por real investido na compra.
     *
     * Usa o GMROI quando existe estoque estimado confiável; senão cai para a
     * margem percentual ponderada pela velocidade, que é o melhor proxy
     * disponível — produto que gira rápido devolve o capital mais cedo, mesmo
     * com margem parecida.
     */
    private static BigDecimal capitalEfficiency(CapitalMetric metric) {
        if (metric.gmroi() != null && metric.gmroi().signum() > 0) {
            return metric.gmroi();
        }
        BigDecimal marginPct = metric.grossMarginPercent() != null
            ? metric.grossMarginPercent()
            : BigDecimal.ZERO;
        BigDecimal velocity = metric.dailyVelocity() != null
            ? metric.dailyVelocity()
            : BigDecimal.ZERO;
        // Escala arbitrária mas monotônica: serve para ordenar, não como valor
        // absoluto exibido ao usuário.
        return marginPct.multiply(velocity).divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP);
    }

    /** Margem esperada ao vender as unidades compradas. */
    private static BigDecimal expectedMarginFor(CapitalMetric metric, BigDecimal units) {
        if (metric.unitPrice() == null || metric.unitCost() == null) {
            return BigDecimal.ZERO;
        }
        BigDecimal unitMargin = metric.unitPrice().subtract(metric.unitCost());
        if (unitMargin.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        return unitMargin.multiply(units).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal expectedReturnRate(BigDecimal allocated, BigDecimal margin) {
        if (allocated == null || allocated.signum() <= 0) {
            return null;
        }
        return margin.divide(allocated, 4, RoundingMode.HALF_UP)
            .multiply(BigDecimal.valueOf(100))
            .setScale(2, RoundingMode.HALF_UP);
    }

    private PurchaseLine toLine(CapitalMetric m, BigDecimal units, BigDecimal value, boolean funded) {
        return new PurchaseLine(
            m.productId(), m.name(), m.category(), m.ean(), m.imageUrl(),
            units != null ? units.setScale(3, RoundingMode.HALF_UP) : BigDecimal.ZERO,
            value != null ? value.setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO,
            m.unitCost(), m.unitPrice(),
            m.gmroi(), m.grossMarginPercent(), m.dailyVelocity(), m.coverageDays(),
            m.abcClass(), m.xyzClass(), m.capitalStatus(), m.capitalReason(),
            m.inventoryUnits(), m.inventoryConfidence(), m.stagnationRisk(), m.momentumScore(),
            funded
        );
    }

    /** Visão agregada do portfólio: onde o capital está e como se comporta. */
    private PortfolioSummary buildSummary(List<CapitalMetric> portfolio) {
        BigDecimal totalInventoryValue = BigDecimal.ZERO;
        BigDecimal healthyCapital = BigDecimal.ZERO;
        BigDecimal frozenCapital = BigDecimal.ZERO;
        int invest = 0, manter = 0, reduzir = 0, liquidar = 0;
        int classA = 0, classB = 0, classC = 0;

        BigDecimal gmroiWeightedSum = BigDecimal.ZERO;
        BigDecimal gmroiWeightBase = BigDecimal.ZERO;

        for (CapitalMetric m : portfolio) {
            BigDecimal value = m.inventoryValue() != null ? m.inventoryValue() : BigDecimal.ZERO;
            totalInventoryValue = totalInventoryValue.add(value);

            switch (m.capitalStatus()) {
                case INVEST -> { invest++; healthyCapital = healthyCapital.add(value); }
                case MANTER -> { manter++; healthyCapital = healthyCapital.add(value); }
                case REDUZIR -> { reduzir++; frozenCapital = frozenCapital.add(value); }
                case LIQUIDAR -> { liquidar++; frozenCapital = frozenCapital.add(value); }
            }

            switch (m.abcClass()) {
                case "A" -> classA++;
                case "B" -> classB++;
                default  -> classC++;
            }

            // GMROI do portfólio ponderado pelo capital: um produto com R$ 10 mil
            // parados pesa mais do que um com R$ 50.
            if (m.gmroi() != null && value.signum() > 0) {
                gmroiWeightedSum = gmroiWeightedSum.add(m.gmroi().multiply(value));
                gmroiWeightBase = gmroiWeightBase.add(value);
            }
        }

        BigDecimal portfolioGmroi = gmroiWeightBase.signum() > 0
            ? gmroiWeightedSum.divide(gmroiWeightBase, 4, RoundingMode.HALF_UP)
            : null;

        BigDecimal frozenShare = totalInventoryValue.signum() > 0
            ? frozenCapital.divide(totalInventoryValue, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP)
            : BigDecimal.ZERO;

        return new PortfolioSummary(
            portfolio.size(),
            totalInventoryValue.setScale(2, RoundingMode.HALF_UP),
            healthyCapital.setScale(2, RoundingMode.HALF_UP),
            frozenCapital.setScale(2, RoundingMode.HALF_UP),
            frozenShare,
            portfolioGmroi,
            invest, manter, reduzir, liquidar,
            classA, classB, classC
        );
    }

    // ── Tipos de saída ───────────────────────────────────────────────────────

    public record PurchaseLine(
        UUID productId, String name, String category, String ean, String imageUrl,
        BigDecimal units, BigDecimal value,
        BigDecimal unitCost, BigDecimal unitPrice,
        BigDecimal gmroi, BigDecimal marginPercent,
        BigDecimal dailyVelocity, BigDecimal coverageDays,
        String abcClass, String xyzClass,
        CapitalStatus capitalStatus, String reason,
        BigDecimal inventoryUnits, BigDecimal inventoryConfidence,
        BigDecimal stagnationRisk, BigDecimal momentumScore,
        boolean funded
    ) {}

    public record PortfolioSummary(
        int productCount,
        BigDecimal totalInventoryValue,
        BigDecimal healthyCapital,
        BigDecimal frozenCapital,
        BigDecimal frozenCapitalPercent,
        BigDecimal portfolioGmroi,
        int investCount, int manterCount, int reduzirCount, int liquidarCount,
        int classACount, int classBCount, int classCCount
    ) {}

    public record PurchasePlan(
        BigDecimal budget,
        BigDecimal allocatedValue,
        BigDecimal remainingBudget,
        BigDecimal totalNeededValue,
        BigDecimal expectedMargin,
        BigDecimal expectedReturnPercent,
        BigDecimal frozenCapital,
        List<PurchaseLine> selected,
        List<PurchaseLine> deferred,
        List<PurchaseLine> frozen,
        PortfolioSummary summary
    ) {
        static PurchasePlan empty() {
            return new PurchasePlan(
                null, BigDecimal.ZERO, null, BigDecimal.ZERO, BigDecimal.ZERO, null, BigDecimal.ZERO,
                List.of(), List.of(), List.of(),
                new PortfolioSummary(0, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                    BigDecimal.ZERO, null, 0, 0, 0, 0, 0, 0, 0)
            );
        }
    }
}
