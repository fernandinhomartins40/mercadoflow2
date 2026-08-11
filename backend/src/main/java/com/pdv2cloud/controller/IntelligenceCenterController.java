package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.campaign.CampaignProductIntelligenceService;
import com.pdv2cloud.service.intelligence.CustomerIntelligenceService;
import com.pdv2cloud.service.intelligence.IntelligenceCenterService;
import com.pdv2cloud.service.intelligence.MarketPriceComparisonDetector;
import com.pdv2cloud.service.intelligence.SalesAnomalyDetector;
import com.pdv2cloud.service.intelligence.ProductIntelligenceMaterializer;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Central de Inteligência: feed único de oportunidades da loja.
 *
 * O prefixo /markets/{marketId} é mantido para que o TenantAccessFilter valide o
 * tenant pela URL, como nas demais rotas de inteligência.
 */
@RestController
@RequestMapping("/api/v1/markets/{marketId}/intelligence")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class IntelligenceCenterController {

    private final IntelligenceCenterService intelligenceCenterService;
    private final ProductIntelligenceMaterializer materializer;
    private final CustomerIntelligenceService customerIntelligenceService;
    private final SalesAnomalyDetector salesAnomalyDetector;
    private final MarketPriceComparisonDetector priceComparisonDetector;
    private final CampaignProductIntelligenceService campaignProductIntelligenceService;
    private final MarketAccessService marketAccessService;

    public IntelligenceCenterController(
        IntelligenceCenterService intelligenceCenterService,
        ProductIntelligenceMaterializer materializer,
        CustomerIntelligenceService customerIntelligenceService,
        SalesAnomalyDetector salesAnomalyDetector,
        MarketPriceComparisonDetector priceComparisonDetector,
        CampaignProductIntelligenceService campaignProductIntelligenceService,
        MarketAccessService marketAccessService
    ) {
        this.intelligenceCenterService = intelligenceCenterService;
        this.materializer = materializer;
        this.customerIntelligenceService = customerIntelligenceService;
        this.salesAnomalyDetector = salesAnomalyDetector;
        this.priceComparisonDetector = priceComparisonDetector;
        this.campaignProductIntelligenceService = campaignProductIntelligenceService;
        this.marketAccessService = marketAccessService;
    }

    /**
     * Oportunidades priorizadas, unificando alertas, capital e promoções.
     *
     * Responde "o que está acontecendo e o que devo fazer hoje?" num lugar só —
     * hoje essa informação está dividida entre quatro telas diferentes.
     */
    @GetMapping("/feed")
    public ResponseEntity<IntelligenceCenterService.IntelligenceFeed> feed(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "limit", defaultValue = "30") int limit,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(intelligenceCenterService.getFeed(marketId, limit));
    }

    /**
     * Recalcula a inteligência materializada desta loja agora, sem esperar o
     * job das 03:00.
     *
     * Serve para dois casos reais: o lojista que acabou de cadastrar custos de
     * compra e quer ver o GMROI refletido, e o suporte que precisa validar um
     * número sem aguardar a madrugada. É uma operação cara (recalcula o
     * portfólio inteiro), por isso é POST e restrita a dono/gerente.
     */
    @PostMapping("/rebuild")
    public ResponseEntity<ProductIntelligenceMaterializer.MaterializationResult> rebuild(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(materializer.materializeMarket(marketId));
    }

    /**
     * Recorrência da base de clientes.
     *
     * Sempre agregado: o CPF nunca sai do banco e nenhum cliente é
     * individualizado — ver CustomerIntelligenceService para as decisões de LGPD.
     */
    @GetMapping("/customers")
    public ResponseEntity<CustomerIntelligenceService.CustomerOverview> customers(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(customerIntelligenceService.overview(marketId));
    }

    /** Produtos que mais trazem o cliente de volta à loja. */
    @GetMapping("/customers/repurchase")
    public ResponseEntity<List<CustomerIntelligenceService.ProductRepurchase>> repurchase(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "limit", defaultValue = "20") int limit,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(customerIntelligenceService.topRepurchaseProducts(marketId, limit));
    }

    /** Dias de venda fora da curva, detectados por EWMA. */
    @GetMapping("/anomalies")
    public ResponseEntity<List<SalesAnomalyDetector.SalesAnomaly>> anomalies(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(salesAnomalyDetector.detect(marketId));
    }

    /** Produtos com preço acima da mediana observada no estado. */
    @GetMapping("/price-comparison")
    public ResponseEntity<List<MarketPriceComparisonDetector.PriceComparison>> priceComparison(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "limit", defaultValue = "20") int limit,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(priceComparisonDetector.detectAboveMarket(marketId, limit));
    }

    /**
     * Impacto de uma campanha atribuído aos seus produtos, com canibalização e
     * efeito pós-janela.
     *
     * Devolve 404 quando a campanha não tem produtos vinculados: nesse caso a
     * medição possível é a de loja inteira, servida pelo endpoint de campanhas.
     */
    @GetMapping("/campaigns/{campaignId}/analysis")
    public ResponseEntity<CampaignProductIntelligenceService.CampaignAnalysis> campaignAnalysis(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("campaignId") UUID campaignId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        CampaignProductIntelligenceService.CampaignAnalysis analysis =
            campaignProductIntelligenceService.analyze(marketId, campaignId);
        return analysis != null ? ResponseEntity.ok(analysis) : ResponseEntity.notFound().build();
    }
}
