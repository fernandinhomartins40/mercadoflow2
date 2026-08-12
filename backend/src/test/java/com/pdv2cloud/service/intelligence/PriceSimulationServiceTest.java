package com.pdv2cloud.service.intelligence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.dto.ProductPromoEffectivenessDTO;
import com.pdv2cloud.model.entity.ProductCapitalMetric.CapitalStatus;
import com.pdv2cloud.service.PromoEffectivenessService;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * Simulação de preço a partir da elasticidade medida.
 *
 * A auditoria registrou a elasticidade como "calculada e nunca usada para
 * recomendar preço". O risco deste recurso não é errar a conta — é dar ao
 * lojista um número com aparência de certeza sobre uma decisão de margem. Por
 * isso os testes cobrem tanto o cálculo quanto as RESSALVAS: quando não há
 * histórico, quando o desconto extrapola a faixa praticada e quando falta custo.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PriceSimulationServiceTest {

    @Mock private PromoEffectivenessService promoService;
    @Mock private CapitalMetricsReader capitalReader;

    private PriceSimulationService service;

    private final UUID marketId = UUID.randomUUID();
    private final UUID productId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new PriceSimulationService(promoService, capitalReader);
    }

    /**
     * Elasticidade 2,0 significa que cada 1% de desconto vende 2% a mais.
     * Com 10% de desconto, o volume deve subir 20%.
     */
    @Test
    void projetaVolumePelaElasticidadeMedida() {
        givenCapital(new BigDecimal("10.00"), new BigDecimal("6.00"), "PURCHASE_HISTORY",
            new BigDecimal("100"));
        givenElasticity(new BigDecimal("-2.0"), new BigDecimal("10"));

        var sim = service.simulate(marketId, productId, BigDecimal.valueOf(10)).orElseThrow();

        assertEquals(0, sim.variacaoQuantidadePercent().compareTo(new BigDecimal("20.0")));
        assertEquals(0, sim.precoSimulado().compareTo(new BigDecimal("9.00")));
        assertTrue(sim.confiavel(), "há histórico de promoção medido");
    }

    /**
     * Elasticidade alta o bastante compensa o desconto: receita e margem sobem.
     *
     * Preço 10 → 9 (−10%), volume 100 → 120 (+20%), custo 6.
     * Margem antes: 100 × 4 = 400. Depois: 120 × 3 = 360 — cai.
     * É o caso mais importante de acertar, porque o faturamento SOBE
     * (1000 → 1080) enquanto a margem cai: exatamente o que o lojista não
     * percebe olhando só a receita.
     */
    @Test
    void receitaSubindoComMargemCaindoEDeSinalizado() {
        givenCapital(new BigDecimal("10.00"), new BigDecimal("6.00"), "PURCHASE_HISTORY",
            new BigDecimal("100"));
        givenElasticity(new BigDecimal("-2.0"), new BigDecimal("10"));

        var sim = service.simulate(marketId, productId, BigDecimal.valueOf(10)).orElseThrow();

        assertTrue(sim.variacaoReceitaPercent().signum() > 0, "receita sobe");
        assertTrue(sim.variacaoMargemPercent().signum() < 0, "mas a margem cai");
        assertTrue(sim.veredito().toLowerCase().contains("girar estoque")
                || sim.veredito().toLowerCase().contains("não compensa"),
            "o veredito precisa avisar que a margem cai: " + sim.veredito());
    }

    /** Sem histórico de promoção, a projeção vira estimativa — e diz isso. */
    @Test
    void semHistoricoAssumeReacaoNeutraEAvisa() {
        givenCapital(new BigDecimal("10.00"), new BigDecimal("6.00"), "PURCHASE_HISTORY",
            new BigDecimal("100"));
        when(promoService.analyzeMarket(any(), anyInt())).thenReturn(List.of());

        var sim = service.simulate(marketId, productId, BigDecimal.valueOf(10)).orElseThrow();

        assertFalse(sim.confiavel());
        assertEquals(0, sim.elasticidade().compareTo(new BigDecimal("1.00")),
            "reação neutra: 1% de desconto, 1% a mais de volume");
        assertTrue(sim.ressalvas().stream().anyMatch(r -> r.contains("estimativa grosseira")));
    }

    /**
     * Extrapolação: simular 40% num produto que só teve 10% de histórico.
     *
     * A elasticidade é LOCAL — vale perto dos descontos já praticados. Fora
     * dessa faixa o número perde precisão, e omitir isso seria dar aparência de
     * certeza a um chute.
     */
    @Test
    void descontoForaDaFaixaPraticadaESinalizado() {
        givenCapital(new BigDecimal("10.00"), new BigDecimal("6.00"), "PURCHASE_HISTORY",
            new BigDecimal("100"));
        givenElasticity(new BigDecimal("-2.0"), new BigDecimal("10"));

        var sim = service.simulate(marketId, productId, BigDecimal.valueOf(40)).orElseThrow();

        assertTrue(sim.extrapolando());
        assertTrue(sim.ressalvas().stream().anyMatch(r -> r.contains("nunca passou")));
    }

    /**
     * Sem custo real, a margem NÃO é calculada — jamais estimada.
     *
     * O sistema tem margem-padrão de 25% para o GMROI, mas usá-la aqui daria
     * uma projeção de margem que parece medida e não é. Numa decisão de preço,
     * isso custa dinheiro de verdade.
     */
    @Test
    void semCustoRealNaoProjetaMargem() {
        givenCapital(new BigDecimal("10.00"), new BigDecimal("7.50"), "MARGIN_ESTIMATE",
            new BigDecimal("100"));
        givenElasticity(new BigDecimal("-2.0"), new BigDecimal("10"));

        var sim = service.simulate(marketId, productId, BigDecimal.valueOf(10)).orElseThrow();

        assertEquals(null, sim.margemDiariaProjetada());
        assertEquals(null, sim.variacaoMargemPercent());
        assertTrue(sim.ressalvas().stream().anyMatch(r -> r.contains("Sem custo cadastrado")));
    }

    /** Preço abaixo do custo é prejuízo por unidade e precisa ser dito. */
    @Test
    void precoAbaixoDoCustoEAvisado() {
        givenCapital(new BigDecimal("10.00"), new BigDecimal("9.50"), "PURCHASE_HISTORY",
            new BigDecimal("100"));
        givenElasticity(new BigDecimal("-2.0"), new BigDecimal("30"));

        var sim = service.simulate(marketId, productId, BigDecimal.valueOf(20)).orElseThrow();

        assertTrue(sim.ressalvas().stream().anyMatch(r -> r.contains("ABAIXO do custo")));
    }

    /** Produto que não reage a desconto: o lojista precisa saber antes de dar. */
    @Test
    void produtoInelasticoEAvisado() {
        givenCapital(new BigDecimal("10.00"), new BigDecimal("6.00"), "PURCHASE_HISTORY",
            new BigDecimal("100"));
        givenElasticity(new BigDecimal("-0.2"), new BigDecimal("10"));

        var sim = service.simulate(marketId, productId, BigDecimal.valueOf(10)).orElseThrow();

        assertTrue(sim.ressalvas().stream().anyMatch(r -> r.contains("reage pouco")));
    }

    /** A canibalização é sempre declarada: o modelo não a conhece. */
    @Test
    void canibalizacaoESempreRessalvada() {
        givenCapital(new BigDecimal("10.00"), new BigDecimal("6.00"), "PURCHASE_HISTORY",
            new BigDecimal("100"));
        givenElasticity(new BigDecimal("-2.0"), new BigDecimal("10"));

        var sim = service.simulate(marketId, productId, BigDecimal.valueOf(10)).orElseThrow();

        assertTrue(sim.ressalvas().stream().anyMatch(r -> r.contains("prateleira")));
    }

    /** Entradas absurdas não produzem simulação. */
    @Test
    void descontoInvalidoNaoSimula() {
        givenCapital(new BigDecimal("10.00"), new BigDecimal("6.00"), "PURCHASE_HISTORY",
            new BigDecimal("100"));

        assertTrue(service.simulate(marketId, productId, BigDecimal.ZERO).isEmpty());
        assertTrue(service.simulate(marketId, productId, BigDecimal.valueOf(-5)).isEmpty());
        assertTrue(service.simulate(marketId, productId, BigDecimal.valueOf(95)).isEmpty());
        assertTrue(service.simulate(marketId, productId, null).isEmpty());
    }

    /** Produto sem métrica de capital não tem preço atual: nada a simular. */
    @Test
    void produtoSemMetricaNaoSimula() {
        when(capitalReader.forProduct(any(), any(), anyInt())).thenReturn(null);

        assertTrue(service.simulate(marketId, productId, BigDecimal.valueOf(10)).isEmpty());
    }

    private void givenCapital(
        BigDecimal unitPrice, BigDecimal unitCost, String costSource, BigDecimal dailyVelocity
    ) {
        CapitalMetric metric = new CapitalMetric(
            productId, "Arroz 5kg", "Mercearia", "7891000000001", null,
            new BigDecimal("9000"), new BigDecimal("900"),
            null, new BigDecimal("40"),
            unitCost, unitPrice, costSource,
            dailyVelocity, new BigDecimal("0.3"),
            "A", "X",
            new BigDecimal("0.1"), new BigDecimal("0.1"),
            new BigDecimal("500"), new BigDecimal("3000"),
            new BigDecimal("0.9"), "HISTORICO_CONSISTENTE",
            new BigDecimal("5"), new BigDecimal("3.2"),
            new BigDecimal("100"), new BigDecimal("200"), new BigDecimal("1200"),
            new BigDecimal("1.05"), new BigDecimal("0.1"),
            CapitalStatus.INVEST, "gira bem",
            new BigDecimal("50"), LocalDate.now()
        );
        when(capitalReader.forProduct(any(), any(), anyInt())).thenReturn(metric);
    }

    private void givenElasticity(BigDecimal elasticity, BigDecimal avgDiscount) {
        ProductPromoEffectivenessDTO dto = new ProductPromoEffectivenessDTO();
        dto.setProductId(productId);
        dto.setPriceElasticity(elasticity);
        dto.setAvgDiscountPercent(avgDiscount);
        dto.setClassification("BOOSTER");
        when(promoService.analyzeMarket(any(), anyInt())).thenReturn(List.of(dto));
    }
}
