package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.PlanService;
import com.pdv2cloud.service.intelligence.CustomerIntelligenceService;
import java.util.LinkedHashMap;
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
 * Base de clientes: quem volta, com que frequência e o que faz voltar.
 *
 * A camada existe desde a Fase 2 — {@code customer_profiles} e
 * {@code product_repurchase_stats}, alimentadas do CPF da nota com HMAC e salt
 * por tenant — mas nunca teve tela. Este controller é o que faltava.
 *
 * <b>Recurso do plano Profissional.</b> Não por capricho: análise de base
 * exige base. Uma loja pequena tem poucos clientes recorrentes e o dado não
 * sustenta conclusão nenhuma; loja com movimento, sim. O limite é natural.
 *
 * <b>LGPD:</b> nada aqui devolve documento. O CPF é hasheado dentro do banco
 * (nunca trafega até a aplicação) e a estatística por produto só é publicada
 * acima do k-anonimato de 5 clientes, garantido no próprio serviço.
 */
@RestController
@RequestMapping("/api/v1/markets/{marketId}/intelligence/customers")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class CustomerIntelligenceController {

    private final CustomerIntelligenceService customerService;
    private final MarketAccessService marketAccessService;
    private final PlanService planService;

    public CustomerIntelligenceController(
        CustomerIntelligenceService customerService,
        MarketAccessService marketAccessService,
        PlanService planService
    ) {
        this.customerService = customerService;
        this.marketAccessService = marketAccessService;
        this.planService = planService;
    }

    private boolean allowed(UUID marketId) {
        return planService.canUseCustomerIntelligence(planService.limitsFor(marketId));
    }

    /**
     * Visão geral da base: recorrentes, ocasionais e de compra única.
     *
     * Quando o plano não alcança, devolve o convite em vez de sumir — o lojista
     * precisa descobrir que o sistema sabe disso sobre a loja dele.
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> overview(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);

        Map<String, Object> body = new LinkedHashMap<>();
        if (!allowed(marketId)) {
            body.put("bloqueadoPorPlano", true);
            body.put("mensagem", "Saber quem volta à sua loja, com que frequência e "
                + "quais produtos trazem o cliente de volta faz parte do plano "
                + "Profissional.");
            return ResponseEntity.ok(body);
        }

        body.put("bloqueadoPorPlano", false);
        body.put("resumo", customerService.overview(marketId));
        body.put("observacao", "Clientes identificados pelo CPF informado na nota. "
            + "Quem não informa não entra na conta — o número real de compradores "
            + "é maior.");
        return ResponseEntity.ok(body);
    }

    /** Produtos que mais trazem o cliente de volta. */
    @GetMapping("/repurchase")
    public ResponseEntity<List<CustomerIntelligenceService.ProductRepurchase>> repurchase(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "limit", defaultValue = "20") int limit,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(allowed(marketId)
            ? customerService.topRepurchaseProducts(marketId, Math.min(Math.max(limit, 1), 50))
            : List.of());
    }
}
