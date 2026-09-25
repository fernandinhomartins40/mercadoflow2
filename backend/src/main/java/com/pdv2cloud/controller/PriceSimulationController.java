package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.PlanService;
import com.pdv2cloud.service.intelligence.PriceSimulationService;
import java.math.BigDecimal;
import java.util.ArrayList;
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
 * "Se eu baixar 8%, o que acontece?"
 *
 * A auditoria registrou a elasticidade como calculada e nunca usada para
 * recomendar preço. Este endpoint fecha essa lacuna, projetando volume, receita
 * e margem a partir da elasticidade medida no histórico REAL do produto naquela
 * loja.
 *
 * Recurso do plano Profissional: é decisão de margem, não de reposição.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/intelligence/price-simulation")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class PriceSimulationController {

    /**
     * Descontos oferecidos quando o usuário não escolhe um.
     *
     * Cobrem a faixa que o varejo alimentar de fato pratica — abaixo de 5% o
     * consumidor não percebe, acima de 30% já é liquidação.
     */
    private static final List<Integer> DEFAULT_STEPS = List.of(5, 10, 15, 20, 30);

    private final PriceSimulationService simulationService;
    private final MarketAccessService marketAccessService;
    private final PlanService planService;

    public PriceSimulationController(
        PriceSimulationService simulationService,
        MarketAccessService marketAccessService,
        PlanService planService
    ) {
        this.simulationService = simulationService;
        this.marketAccessService = marketAccessService;
        this.planService = planService;
    }

    /**
     * Simula um desconto — ou a faixa inteira, quando nenhum é informado.
     *
     * Devolver vários cenários de uma vez é o que transforma a tela em
     * ferramenta de decisão: o lojista compara 10% contra 20% lado a lado em
     * vez de adivinhar qual pedir.
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> simulate(
        @PathVariable("marketId") UUID marketId,
        @RequestParam("productId") UUID productId,
        @RequestParam(value = "desconto", required = false) BigDecimal desconto,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);

        Map<String, Object> body = new LinkedHashMap<>();

        if (!planService.canUsePriceSimulation(planService.limitsFor(marketId))) {
            body.put("bloqueadoPorPlano", true);
            body.put("mensagem", "Simular o efeito de um desconto no volume, na receita "
                + "e na margem faz parte do plano Profissional.");
            return ResponseEntity.ok(body);
        }

        List<PriceSimulationService.PriceSimulation> cenarios = new ArrayList<>();
        if (desconto != null) {
            simulationService.simulate(marketId, productId, desconto).ifPresent(cenarios::add);
        } else {
            for (Integer step : DEFAULT_STEPS) {
                simulationService.simulate(marketId, productId, BigDecimal.valueOf(step))
                    .ifPresent(cenarios::add);
            }
        }

        body.put("bloqueadoPorPlano", false);
        body.put("cenarios", cenarios);
        if (cenarios.isEmpty()) {
            body.put("mensagem", "Ainda não há dados suficientes deste produto para "
                + "projetar o efeito de um desconto.");
        }
        return ResponseEntity.ok(body);
    }
}
