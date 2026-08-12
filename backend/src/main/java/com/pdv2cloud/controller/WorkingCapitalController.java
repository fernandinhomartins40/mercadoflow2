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
     * A LISTA VEM COMPLETA EM QUALQUER PLANO desde 12/08/2026. Antes o gratuito
     * via 5 de centenas, o que impedia usar o recurso — o limite do plano passou
     * a ser a JANELA de análise, que deixa a ferramenta funcionar e ainda dá
     * motivo concreto de upgrade a quem precisa comparar com o ano passado.
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
            capitalMetricsReader.portfolio(marketId, planService.clampWindow(limits, windowDays));
        return ResponseEntity.ok(GatedListDTO.complete(all));
    }

    /**
     * Plano de compra para o orçamento informado.
     *
     * Sem {@code budget}, devolve o plano completo — útil para o usuário ver
     * quanto precisaria investir para repor tudo que está abaixo do ideal.
     */
    @GetMapping("/capital/purchase-plan")
    public ResponseEntity<?> purchasePlan(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "budget", required = false) BigDecimal budget,
        @RequestParam(value = "windowDays", defaultValue = "90") int windowDays,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        PlanService.EffectiveLimits limits = planService.limitsFor(marketId);

        // O gratuito planeja compras até o teto de orçamento, com a lista
        // INTEIRA. Limitar o valor em vez da lista mantém o recurso utilizável:
        // quem compra pouco opera 100%, quem compra muito esbarra no teto
        // justamente quando o plano está lhe rendendo dinheiro.
        BigDecimal cap = planService.purchaseBudgetCap(limits);
        BigDecimal effectiveBudget = budget;
        boolean budgetCapped = false;
        if (cap != null && budget != null && budget.compareTo(cap) > 0) {
            effectiveBudget = cap;
            budgetCapped = true;
        }

        PurchasePlanService.PurchasePlan plan = purchasePlanService.buildPlan(
            marketId, effectiveBudget, planService.clampWindow(limits, windowDays));
        if (!budgetCapped) {
            return ResponseEntity.ok(plan);
        }

        // Teto aplicado: a tela precisa dizer POR QUE o plano não usou o valor
        // pedido, senão o número parece errado.
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("plan", plan);
        body.put("budgetCapped", true);
        body.put("requestedBudget", budget);
        body.put("appliedBudget", cap);
        body.put("upgradeMessage", String.format(
            "O plano %s planeja compras de até R$ %,.0f por vez. "
                + "Faça upgrade para planejar com o orçamento inteiro.",
            limits.plan().getDisplayName(), cap));
        return ResponseEntity.ok(body);
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
        return ResponseEntity.ok(GatedListDTO.complete(all));
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
            GatedListDTO.complete(recs.traction()));
        response.put("clearance",
            GatedListDTO.complete(recs.clearance()));
        return ResponseEntity.ok(response);
    }
}
