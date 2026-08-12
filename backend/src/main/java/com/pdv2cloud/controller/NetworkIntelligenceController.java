package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.PlanService;
import com.pdv2cloud.service.intelligence.NetworkIntelligenceService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Visão de rede: comparar filiais, sugerir transferência, ver divergência de
 * preço.
 *
 * O {@code marketId} da URL é sempre a **matriz**, e o
 * {@link MarketAccessService} garante que quem chama tem acesso a ela. As
 * filiais são derivadas dela no serviço — nunca vêm de parâmetro, senão
 * bastaria informar o id de outra rede para ler os números dela.
 *
 * Restrito ao dono e ao admin: comparar filiais é informação de rede, e o
 * gerente de uma loja não deve ver os números da irmã por padrão.
 */
@RestController
@RequestMapping("/api/v1/markets/{marketId}/network")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'ADMIN')")
public class NetworkIntelligenceController {

    private final NetworkIntelligenceService networkService;
    private final MarketAccessService marketAccessService;
    private final PlanService planService;

    public NetworkIntelligenceController(
        NetworkIntelligenceService networkService,
        MarketAccessService marketAccessService,
        PlanService planService
    ) {
        this.networkService = networkService;
        this.marketAccessService = marketAccessService;
        this.planService = planService;
    }

    /**
     * O plano deste mercado alcança a inteligência de rede?
     *
     * O recurso já exigia 2+ lojas na prática, e o Essencial permite 1 — o
     * bloqueio existia de fato, mas não estava NOMEADO, então não vendia plano
     * nenhum. Agora é recurso declarado do Profissional.
     */
    private boolean allowed(UUID marketId) {
        return planService.canUseNetworkIntelligence(planService.limitsFor(marketId));
    }

    /**
     * Este mercado é uma rede? A UI usa para decidir se mostra a seção.
     *
     * Loja única devolve {@code false} e nenhuma outra chamada é feita — não
     * faz sentido oferecer comparação entre filiais para quem tem uma só.
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);

        if (!allowed(marketId)) {
            // A tela mostra o convite em vez de sumir: quem tem mais de uma
            // loja precisa DESCOBRIR que existe comparação entre elas.
            return ResponseEntity.ok(Map.of(
                "rede", false,
                "filiais", 0,
                "bloqueadoPorPlano", true,
                "mensagem", "Comparar filiais, sugerir transferência de estoque e "
                    + "acompanhar divergência de preço entre lojas fazem parte do "
                    + "plano Profissional."
            ));
        }

        boolean isNetwork = networkService.isNetwork(marketId);
        return ResponseEntity.ok(Map.of(
            "rede", isNetwork,
            "filiais", isNetwork ? networkService.branchOverview(marketId).size() : 0,
            "bloqueadoPorPlano", false
        ));
    }

    /** Resumo de cada loja da rede, da que mais fatura para a que menos. */
    @GetMapping("/branches")
    public ResponseEntity<List<NetworkIntelligenceService.BranchSummary>> branches(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(allowed(marketId) ? networkService.branchOverview(marketId) : List.of());
    }

    /** O mesmo produto lado a lado nas filiais, maior discrepância primeiro. */
    @GetMapping("/products")
    public ResponseEntity<List<NetworkIntelligenceService.ProductAcrossBranches>> products(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "limit", defaultValue = "30") int limit,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(allowed(marketId) ? networkService.compareProducts(marketId, limit) : List.of());
    }

    /** Onde sobra estoque numa filial e falta em outra. */
    @GetMapping("/transfers")
    public ResponseEntity<List<NetworkIntelligenceService.TransferSuggestion>> transfers(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "limit", defaultValue = "20") int limit,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(allowed(marketId) ? networkService.transferOpportunities(marketId, limit) : List.of());
    }

    /** Mesmo produto com preços diferentes entre as lojas. */
    @GetMapping("/price-divergences")
    public ResponseEntity<List<NetworkIntelligenceService.PriceDivergence>> priceDivergences(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "limit", defaultValue = "20") int limit,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(allowed(marketId) ? networkService.priceDivergences(marketId, limit) : List.of());
    }
}
