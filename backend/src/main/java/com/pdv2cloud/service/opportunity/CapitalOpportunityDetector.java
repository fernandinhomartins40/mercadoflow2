package com.pdv2cloud.service.opportunity;

import com.pdv2cloud.model.entity.ProductCapitalMetric.CapitalStatus;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import com.pdv2cloud.service.intelligence.CapitalMetricsReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Capital parado e excesso de estoque.
 *
 * Migra para o modelo de oportunidade os vereditos REDUZIR e LIQUIDAR do
 * WorkingCapitalService. INVEST e MANTER não viram oportunidade: são o estado
 * saudável e não pedem decisão — um feed que lista o que está certo esconde o
 * que está errado.
 *
 * Também detecta OPORTUNIDADE_DE_COMPRA: produto saudável cuja cobertura caiu
 * abaixo do ponto de reposição. Essa é a face positiva do mesmo cálculo e a que
 * mais se aproxima do propósito do produto — orientar a compra.
 */
@Component
public class CapitalOpportunityDetector implements OpportunityDetector {

    private static final int WINDOW_DAYS = 90;

    /** Abaixo disso a cobertura é curta o bastante para virar urgência. */
    private static final double LOW_COVERAGE_DAYS = 7.0;

    private final CapitalMetricsReader capitalMetricsReader;

    public CapitalOpportunityDetector(CapitalMetricsReader capitalMetricsReader) {
        this.capitalMetricsReader = capitalMetricsReader;
    }

    @Override
    public String name() {
        return "capital";
    }

    @Override
    public List<DetectedOpportunity> detect(UUID marketId) {
        List<CapitalMetric> portfolio = capitalMetricsReader.portfolio(marketId, WINDOW_DAYS);
        List<DetectedOpportunity> out = new ArrayList<>();

        for (CapitalMetric m : portfolio) {
            if (m.capitalStatus() == CapitalStatus.LIQUIDAR
                || m.capitalStatus() == CapitalStatus.REDUZIR) {
                out.add(frozenCapital(m));
            } else if (needsReplenishment(m)) {
                out.add(replenishment(m));
            }
        }
        return out;
    }

    /**
     * Vale comprar quando o produto gira, o capital não está sobrando e a
     * cobertura já caiu abaixo do ponto de reposição.
     *
     * A checagem de coverageDays não-nula importa: sem estoque estimado
     * confiável, sugerir compra seria chutar.
     */
    private boolean needsReplenishment(CapitalMetric m) {
        return m.suggestedOrderUnits() != null
            && m.suggestedOrderUnits().signum() > 0
            && m.coverageDays() != null
            && m.coverageDays().doubleValue() <= LOW_COVERAGE_DAYS
            && m.dailyVelocity() != null
            && m.dailyVelocity().signum() > 0;
    }

    private DetectedOpportunity frozenCapital(CapitalMetric m) {
        boolean liquidar = m.capitalStatus() == CapitalStatus.LIQUIDAR;

        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("classeAbc", m.abcClass());
        evidence.put("classeXyz", m.xyzClass());
        evidence.put("giroDiario", m.dailyVelocity());
        evidence.put("coberturaDias", m.coverageDays());
        evidence.put("gmroi", m.gmroi());
        evidence.put("riscoEstagnacao", m.stagnationRisk());
        evidence.put("valorEstoque", m.inventoryValue());
        evidence.put("confiancaEstoque", m.inventoryConfidence());

        return new DetectedOpportunity(
            "CAPITAL:" + m.productId(),
            liquidar ? "CAPITAL_PARADO" : "EXCESSO_DE_ESTOQUE",
            "CAPITAL",
            m.productId(),
            (liquidar ? "Liquidar: " : "Reduzir compra: ") + m.name(),
            m.capitalReason(),
            evidence,
            m.inventoryValue(),
            m.inventoryConfidence(),
            normalizePriority(m.priorityScore())
        );
    }

    private DetectedOpportunity replenishment(CapitalMetric m) {
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("giroDiario", m.dailyVelocity());
        evidence.put("coberturaDias", m.coverageDays());
        evidence.put("pontoReposicao", m.reorderPointUnits());
        evidence.put("quantidadeSugerida", m.suggestedOrderUnits());
        evidence.put("valorSugerido", m.suggestedOrderValue());
        evidence.put("classeAbc", m.abcClass());
        evidence.put("confiancaEstoque", m.inventoryConfidence());

        String descricao = String.format(
            "Cobertura atual de %.1f dia(s) com giro de %.2f un./dia. %s",
            m.coverageDays().doubleValue(),
            m.dailyVelocity().doubleValue(),
            m.capitalReason() != null ? m.capitalReason() : "");

        // Produto de classe A com pouca cobertura é o que dói mais deixar
        // faltar: concentra receita e a ruptura aparece no caixa no mesmo dia.
        double priority = 60.0
            + ("A".equals(m.abcClass()) ? 25.0 : "B".equals(m.abcClass()) ? 12.0 : 0.0)
            + Math.max(0, (LOW_COVERAGE_DAYS - m.coverageDays().doubleValue()) * 2);

        return new DetectedOpportunity(
            "COMPRA:" + m.productId(),
            "OPORTUNIDADE_DE_COMPRA",
            "CAPITAL",
            m.productId(),
            "Repor estoque: " + m.name(),
            descricao.trim(),
            evidence,
            m.suggestedOrderValue(),
            m.inventoryConfidence(),
            BigDecimal.valueOf(Math.min(100, priority)).setScale(2, RoundingMode.HALF_UP)
        );
    }

    /** priorityScore do capital é 0–100+; o feed compara tudo em 0–100. */
    private BigDecimal normalizePriority(BigDecimal raw) {
        if (raw == null) return BigDecimal.valueOf(50);
        return raw.min(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP);
    }
}
