package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.GatedListDTO;
import com.pdv2cloud.service.InvoiceRejectionService;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.PlanService;
import com.pdv2cloud.service.PromoIntelligenceService;
import com.pdv2cloud.service.PurchasePlanService;
import com.pdv2cloud.service.WorkingCapitalService;
import com.pdv2cloud.service.intelligence.CapitalMetricsReader;
import com.pdv2cloud.service.intelligence.HaloEffectsReader;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

    private final CapitalMetricsReader capitalMetricsReader;
    private final HaloEffectsReader haloEffectsReader;
    private final PurchasePlanService purchasePlanService;
    private final PromoIntelligenceService promoIntelligenceService;
    private final MarketAccessService marketAccessService;
    private final PlanService planService;
    private final InvoiceRejectionService rejectionService;

    public WorkingCapitalController(
        CapitalMetricsReader capitalMetricsReader,
        HaloEffectsReader haloEffectsReader,
        PurchasePlanService purchasePlanService,
        PromoIntelligenceService promoIntelligenceService,
        MarketAccessService marketAccessService,
        PlanService planService,
        InvoiceRejectionService rejectionService
    ) {
        this.capitalMetricsReader = capitalMetricsReader;
        this.haloEffectsReader = haloEffectsReader;
        this.purchasePlanService = purchasePlanService;
        this.promoIntelligenceService = promoIntelligenceService;
        this.marketAccessService = marketAccessService;
        this.planService = planService;
        this.rejectionService = rejectionService;
    }

    /**
     * Plano e consumo do próprio mercado. Alimenta o medidor de uso e o aviso
     * de upgrade na interface do supermercadista.
     */
    @GetMapping("/billing/usage")
    public ResponseEntity<Map<String, Object>> usage(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        PlanService.UsageSnapshot usage = planService.usageFor(marketId);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("planCode", usage.limits().plan().name());
        response.put("planName", usage.limits().plan().getDisplayName());
        response.put("cycleStart", usage.cycleStart());
        response.put("cycleEnd", usage.cycleEnd());
        // A cota passou a ser SEMANAL (V52): o nome do campo do plano ainda diz
        // "monthly" por compatibilidade, mas o período é a semana.
        response.put("cycleType", "SEMANAL");
        response.put("invoiceLimit", usage.limits().monthlyInvoices());
        // Acervo aceito fora da cota. Sem este número, o lojista que enviou
        // 3.000 notas de histórico veria "0 usadas" e não entenderia o que
        // aconteceu com o envio dele.
        response.put("historicalIngested", usage.historicalIngested());
        response.put("invoicesUsed", usage.invoicesUsed());
        response.put("invoicesRejected", usage.invoicesRejected());
        response.put("invoicesRemaining", usage.remainingInvoices());
        response.put("usagePercent", usage.usagePercent());
        response.put("limitReached", usage.limitReached());
        response.put("nearLimit", usage.nearLimit());
        response.put("limitReachedAt", usage.limitReachedAt());
        response.put("pdvLimit", usage.limits().pdvs());
        response.put("pdvCount", usage.pdvCount());
        response.put("pdvsPerBranchLimit", usage.limits().pdvsPerBranch());
        response.put("branchLimit", usage.limits().branches());
        response.put("branchCount", usage.branchCount());
        response.put("seatLimit", usage.limits().seats());
        response.put("seatCount", usage.seatCount());
        response.put("historyDays", usage.limits().historyDays());
        response.put("fullInsights", usage.limits().fullInsights());
        // O que ficou de fora e volta sozinho quando a cota renovar.
        response.putAll(rejectionService.pendingSummary(marketId));
        return ResponseEntity.ok(response);
    }

    // ── Capital de giro ──────────────────────────────────────────────────────

    /**
     * Métricas por produto: ABC/XYZ, GMROI, cobertura e veredito de capital.
     *
     * No plano gratuito a lista vem recortada nos principais itens — ver
     * {@link GatedListDTO}.
     */
    @GetMapping("/capital/portfolio")
    public ResponseEntity<GatedListDTO<WorkingCapitalService.CapitalMetric>> portfolio(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "windowDays", defaultValue = "90") int windowDays,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        PlanService.EffectiveLimits limits = planService.limitsFor(marketId);
        List<WorkingCapitalService.CapitalMetric> all =
            capitalMetricsReader.portfolio(marketId, windowDays);
        return ResponseEntity.ok(GatedListDTO.of(planService.sliceInsights(limits, all), limits.plan()));
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
        PlanService.EffectiveLimits limits = planService.limitsFor(marketId);
        PurchasePlanService.PurchasePlan plan = purchasePlanService.buildPlan(marketId, budget, windowDays);
        // O resumo do portfólio (capital total, parado, GMROI) permanece
        // completo no gratuito: é o que mostra o tamanho do problema. Só as
        // listas item a item — o que de fato operacionaliza a compra — são
        // recortadas.
        return ResponseEntity.ok(truncatePlanLists(plan, limits));
    }

    private PurchasePlanService.PurchasePlan truncatePlanLists(
        PurchasePlanService.PurchasePlan plan,
        PlanService.EffectiveLimits limits
    ) {
        if (limits.fullInsights()) {
            return plan;
        }
        return new PurchasePlanService.PurchasePlan(
            plan.budget(),
            plan.allocatedValue(),
            plan.remainingBudget(),
            plan.totalNeededValue(),
            plan.expectedMargin(),
            plan.expectedReturnPercent(),
            plan.frozenCapital(),
            planService.sliceInsights(limits, plan.selected()).items(),
            planService.sliceInsights(limits, plan.deferred()).items(),
            planService.sliceInsights(limits, plan.frozen()).items(),
            plan.summary()
        );
    }

    // ── Inteligência de promoções ────────────────────────────────────────────

    /** Produtos que puxam a venda de outros quando entram em promoção. */
    @GetMapping("/promo-intelligence/traffic-drivers")
    public ResponseEntity<GatedListDTO<PromoIntelligenceService.TrafficDriver>> trafficDrivers(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "windowDays", defaultValue = "180") int windowDays,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        PlanService.EffectiveLimits limits = planService.limitsFor(marketId);
        List<PromoIntelligenceService.TrafficDriver> all =
            haloEffectsReader.trafficDrivers(marketId, windowDays);
        return ResponseEntity.ok(GatedListDTO.of(planService.sliceInsights(limits, all), limits.plan()));
    }

    /** Detalhe do efeito halo par a par (driver → alvo). */
    @GetMapping("/promo-intelligence/halo")
    public ResponseEntity<List<PromoIntelligenceService.HaloEffect>> halo(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "windowDays", defaultValue = "180") int windowDays,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(haloEffectsReader.haloEffects(marketId, windowDays));
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
    public ResponseEntity<Map<String, Object>> recommendations(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "windowDays", defaultValue = "180") int windowDays,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        PlanService.EffectiveLimits limits = planService.limitsFor(marketId);
        PromoIntelligenceService.PromoRecommendations recs =
            promoIntelligenceService.recommend(marketId, windowDays);

        // Cada objetivo é recortado por si: o gratuito vê os principais
        // candidatos de tração E de liquidação, em vez de perder um dos dois.
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("traction",
            GatedListDTO.of(planService.sliceInsights(limits, recs.traction()), limits.plan()));
        response.put("clearance",
            GatedListDTO.of(planService.sliceInsights(limits, recs.clearance()), limits.plan()));
        return ResponseEntity.ok(response);
    }
}
