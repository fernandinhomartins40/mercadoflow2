package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

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
@Profile("!jobs")
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
    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate jdbc;

    /** Só para mercado sem métricas materializadas (o cálculo on-line custa segundos). */
    private final com.pdv2cloud.util.StaleWhileRevalidateCache<Map<String, Object>> giroFallback =
        new com.pdv2cloud.util.StaleWhileRevalidateCache<>(java.time.Duration.ofMinutes(15));

    private static final String GIRO_SELECT =
        "select m.product_id as \"productId\", p.name, p.image_url as \"imageUrl\", m.abc_class as \"abcClass\", " +
        "m.momentum_score as \"momentumScore\", m.daily_velocity as \"dailyVelocity\", m.capital_status as \"capitalStatus\", " +
        "m.inventory_units as \"inventoryUnits\" from product_capital_metrics m join products p on p.id = m.product_id where m.market_id = :m ";

    /**
     * O cartão Giro do Início: os 5 que vale reforçar e os 5 perdendo ritmo.
     * Antes o Início baixava o portfólio inteiro (6,5 mil produtos) para isso.
     */
    @GetMapping("/capital/giro")
    public Map<String, Object> giro(@PathVariable("marketId") UUID marketId, Authentication authentication) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        org.springframework.jdbc.core.namedparam.MapSqlParameterSource p =
            new org.springframework.jdbc.core.namedparam.MapSqlParameterSource("m", marketId);
        Boolean materialized = jdbc.queryForObject("select exists(select 1 from product_capital_metrics where market_id = :m)", p, Boolean.class);
        if (Boolean.TRUE.equals(materialized)) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("rapido", jdbc.queryForList(GIRO_SELECT + "and m.capital_status = 'INVEST' order by m.daily_velocity desc nulls last limit 5", p));
            out.put("perdendo", jdbc.queryForList(GIRO_SELECT + "and m.capital_status in ('REDUZIR', 'LIQUIDAR') order by coalesce(m.momentum_score, 1) asc limit 5", p));
            out.put("noStock", !Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from product_capital_metrics where market_id = :m and inventory_units is not null)", p, Boolean.class)));
            return out;
        }
        return giroFallback.get(marketId, () -> {
            List<WorkingCapitalService.CapitalMetric> all = capitalMetricsReader.portfolio(marketId, 90);
            java.util.function.Function<WorkingCapitalService.CapitalMetric, Map<String, Object>> row = m -> {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("productId", m.productId());
                r.put("name", m.name());
                r.put("imageUrl", m.imageUrl());
                r.put("abcClass", m.abcClass());
                r.put("momentumScore", m.momentumScore());
                r.put("dailyVelocity", m.dailyVelocity());
                r.put("capitalStatus", m.capitalStatus());
                r.put("inventoryUnits", m.inventoryUnits());
                return r;
            };
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("rapido", all.stream().filter(m -> "INVEST".equals(String.valueOf(m.capitalStatus())))
                .sorted(java.util.Comparator.comparing((WorkingCapitalService.CapitalMetric m) -> m.dailyVelocity() == null ? BigDecimal.ZERO : m.dailyVelocity()).reversed())
                .limit(5).map(row).toList());
            out.put("perdendo", all.stream().filter(m -> "REDUZIR".equals(String.valueOf(m.capitalStatus())) || "LIQUIDAR".equals(String.valueOf(m.capitalStatus())))
                .sorted(java.util.Comparator.comparing((WorkingCapitalService.CapitalMetric m) -> m.momentumScore() == null ? BigDecimal.ONE : m.momentumScore()))
                .limit(5).map(row).toList());
            out.put("noStock", all.stream().allMatch(m -> m.inventoryUnits() == null));
            return out;
        });
    }

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
