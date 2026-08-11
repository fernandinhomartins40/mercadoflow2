package com.pdv2cloud.service.opportunity;

import com.pdv2cloud.service.PromoIntelligenceService;
import com.pdv2cloud.service.PromoIntelligenceService.PromoCandidate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Candidatos a promoção e produtos tracionadores.
 *
 * Migra `PromoIntelligenceService.recommend()` para o modelo de oportunidade,
 * preservando a distinção que ele já fazia entre os dois objetivos:
 *
 *  TRAÇÃO      o produto puxa a venda de OUTROS quando entra em promoção. O
 *              ganho não está nele, está na cesta que ele arrasta.
 *  LIQUIDAÇÃO  o produto tem capital exposto e precisa girar. O desconto é o
 *              custo de recuperar o dinheiro parado.
 *
 * São decisões comerciais opostas e o feed precisa deixar isso claro — promover
 * um tracionador com desconto de liquidação destrói margem sem necessidade.
 */
@Component
public class PromotionOpportunityDetector implements OpportunityDetector {

    private static final int WINDOW_DAYS = 180;

    private final PromoIntelligenceService promoIntelligenceService;

    public PromotionOpportunityDetector(PromoIntelligenceService promoIntelligenceService) {
        this.promoIntelligenceService = promoIntelligenceService;
    }

    @Override
    public String name() {
        return "promocao";
    }

    @Override
    public List<DetectedOpportunity> detect(UUID marketId) {
        PromoIntelligenceService.PromoRecommendations recs =
            promoIntelligenceService.recommend(marketId, WINDOW_DAYS);

        List<DetectedOpportunity> out = new ArrayList<>();
        recs.traction().forEach(c -> out.add(toOpportunity(c, "PRODUTO_TRACIONADOR")));
        recs.clearance().forEach(c -> out.add(toOpportunity(c, "OPORTUNIDADE_DE_PROMOCAO")));
        return out;
    }

    private DetectedOpportunity toOpportunity(PromoCandidate candidate, String type) {
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("objetivo", candidate.objective());
        evidence.put("precoAtual", candidate.currentPrice());
        evidence.put("descontoSugerido", candidate.suggestedDiscountPercent());
        evidence.put("margemPercent", candidate.marginPercent());
        evidence.put("giroDiario", candidate.dailyVelocity());
        evidence.put("coberturaDias", candidate.coverageDays());
        evidence.put("capitalEmRisco", candidate.capitalAtRisk());
        evidence.put("produtosAfetados", candidate.affectedProducts());
        if (candidate.topTargets() != null && !candidate.topTargets().isEmpty()) {
            evidence.put("puxaVendaDe", candidate.topTargets().stream()
                .map(PromoIntelligenceService.HaloTarget::name)
                .toList());
        }

        return new DetectedOpportunity(
            "PROMO:" + candidate.productId(),
            type,
            "PROMOCAO",
            candidate.productId(),
            "Promover: " + candidate.name(),
            candidate.reason(),
            evidence,
            candidate.expectedIncrementalRevenue(),
            null,
            candidate.score() != null
                ? candidate.score().setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.valueOf(50)
        );
    }
}
