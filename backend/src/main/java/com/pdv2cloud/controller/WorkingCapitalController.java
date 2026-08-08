package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.PromoIntelligenceService;
import com.pdv2cloud.service.PurchasePlanService;
import com.pdv2cloud.service.WorkingCapitalService;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Inteligência de capital de giro e de promoções.
 *
 * Fica separado do MarketController, que já concentra dezenas de rotas de
 * analytics. O prefixo /markets/{marketId} é mantido para que o TenantAccessFilter
 * continue validando o tenant pela URL automaticamente.
 */
@RestController
@RequestMapping("/api/v1/markets/{marketId}")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class WorkingCapitalController {

    private final WorkingCapitalService workingCapitalService;
    private final PurchasePlanService purchasePlanService;
    private final PromoIntelligenceService promoIntelligenceService;
    private final MarketAccessService marketAccessService;

    public WorkingCapitalController(
        WorkingCapitalService workingCapitalService,
        PurchasePlanService purchasePlanService,
        PromoIntelligenceService promoIntelligenceService,
        MarketAccessService marketAccessService
    ) {
        this.workingCapitalService = workingCapitalService;
        this.purchasePlanService = purchasePlanService;
        this.promoIntelligenceService = promoIntelligenceService;
        this.marketAccessService = marketAccessService;
    }

    // ── Capital de giro ──────────────────────────────────────────────────────

    /** Métricas por produto: ABC/XYZ, GMROI, cobertura e veredito de capital. */
    @GetMapping("/capital/portfolio")
    public ResponseEntity<List<WorkingCapitalService.CapitalMetric>> portfolio(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "windowDays", defaultValue = "90") int windowDays,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(workingCapitalService.computePortfolio(marketId, windowDays));
    }

    /**
     * Plano de compra para o orçamento informado.
     *
     * Sem {@code budget}, devolve o plano completo — útil para o usuário ver
     * quanto precisaria investir para repor tudo que está abaixo do ideal.
     */
    @GetMapping("/capital/purchase-plan")
    public ResponseEntity<PurchasePlanService.PurchasePlan> purchasePlan(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "budget", required = false) BigDecimal budget,
        @RequestParam(value = "windowDays", defaultValue = "90") int windowDays,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(purchasePlanService.buildPlan(marketId, budget, windowDays));
    }

    // ── Inteligência de promoções ────────────────────────────────────────────

    /** Produtos que puxam a venda de outros quando entram em promoção. */
    @GetMapping("/promo-intelligence/traffic-drivers")
    public ResponseEntity<List<PromoIntelligenceService.TrafficDriver>> trafficDrivers(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "windowDays", defaultValue = "180") int windowDays,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(promoIntelligenceService.rankTrafficDrivers(marketId, windowDays));
    }

    /** Detalhe do efeito halo par a par (driver → alvo). */
    @GetMapping("/promo-intelligence/halo")
    public ResponseEntity<List<PromoIntelligenceService.HaloEffect>> halo(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "windowDays", defaultValue = "180") int windowDays,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(promoIntelligenceService.computeHaloEffects(marketId, windowDays));
    }

    /**
     * Índices sazonais por dia da semana e mês. Sem {@code productId}, devolve
     * a sazonalidade da loja inteira.
     */
    @GetMapping("/promo-intelligence/seasonality")
    public ResponseEntity<List<PromoIntelligenceService.SeasonalIndex>> seasonality(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "productId", required = false) UUID productId,
        @RequestParam(value = "windowDays", defaultValue = "365") int windowDays,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(
            promoIntelligenceService.computeSeasonality(marketId, productId, windowDays));
    }

    /** Candidatos a promoção, separados entre tração de cesta e liquidação. */
    @GetMapping("/promo-intelligence/recommendations")
    public ResponseEntity<PromoIntelligenceService.PromoRecommendations> recommendations(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "windowDays", defaultValue = "180") int windowDays,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(promoIntelligenceService.recommend(marketId, windowDays));
    }
}
