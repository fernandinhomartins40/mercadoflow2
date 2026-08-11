package com.pdv2cloud.service.opportunity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.repository.RecommendationRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * O que a recomendação promete ao usuário: uma ação clara, o cálculo aberto e a
 * decisão dele respeitada.
 */
class RecommendationEngineTest {

    private OpportunityRepository opportunityRepository;
    private RecommendationRepository recommendationRepository;
    private RecommendationEngine engine;

    private final UUID marketId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        opportunityRepository = mock(OpportunityRepository.class);
        recommendationRepository = mock(RecommendationRepository.class);
        engine = new RecommendationEngine(opportunityRepository, recommendationRepository);
    }

    private Opportunity opportunity(String type, Map<String, Object> evidence) {
        Product product = new Product();
        product.setId(UUID.randomUUID());
        product.setName("Arroz 5kg");

        Opportunity o = new Opportunity();
        o.setId(UUID.randomUUID());
        o.setType(type);
        o.setProduct(product);
        o.setTitle("titulo");
        o.setDescription("descricao");
        o.setEvidence(evidence);
        o.setConfidence(BigDecimal.valueOf(0.8));
        o.setExpectedImpactValue(BigDecimal.valueOf(1200));
        o.setStatus(Opportunity.Status.NOVA);
        return o;
    }

    private Recommendation captureGenerated(Opportunity o) {
        when(opportunityRepository.findOpenByMarket(marketId)).thenReturn(List.of(o));
        when(recommendationRepository.hasActiveForOpportunity(any())).thenReturn(false);

        engine.generateForMarket(marketId);

        ArgumentCaptor<Recommendation> captor = ArgumentCaptor.forClass(Recommendation.class);
        org.mockito.Mockito.verify(recommendationRepository).save(captor.capture());
        return captor.getValue();
    }

    @Test
    @DisplayName("oportunidade de compra vira ação COMPRAR com quantidade")
    void buildsBuyRecommendation() {
        Recommendation r = captureGenerated(opportunity("OPORTUNIDADE_DE_COMPRA", Map.of(
            "quantidadeSugerida", 120,
            "valorSugerido", 1200,
            "coberturaDias", 3,
            "giroDiario", 12.5)));

        assertEquals(Recommendation.ActionType.COMPRAR, r.getActionType());
        assertEquals(Recommendation.Status.PROPOSTA, r.getStatus());
        assertEquals(120, r.getParameters().get("quantidade"));
        assertTrue(r.getTitle().contains("120"), "o titulo precisa dizer quanto comprar");
    }

    @Test
    @DisplayName("capital parado vira LIQUIDAR")
    void buildsLiquidateRecommendation() {
        Recommendation r = captureGenerated(opportunity("CAPITAL_PARADO", Map.of(
            "classeAbc", "C", "classeXyz", "Z",
            "coberturaDias", 180, "giroDiario", 0.2,
            "riscoEstagnacao", 0.9, "gmroi", 0.3)));

        assertEquals(Recommendation.ActionType.LIQUIDAR, r.getActionType());
    }

    @Test
    @DisplayName("tracionador e liquidação geram traces DIFERENTES")
    void tractionAndClearanceExplainDifferently() {
        Recommendation tracao = captureGenerated(opportunity("PRODUTO_TRACIONADOR", Map.of(
            "descontoSugerido", 15, "margemPercent", 30,
            "produtosAfetados", 7, "precoAtual", 10)));

        setUp(); // zera os mocks para a segunda captura

        Recommendation liquidacao = captureGenerated(opportunity("OPORTUNIDADE_DE_PROMOCAO", Map.of(
            "descontoSugerido", 25, "margemPercent", 20,
            "capitalEmRisco", 5000, "coberturaDias", 120,
            "giroDiario", 0.5, "precoAtual", 10)));

        assertEquals(Recommendation.ActionType.PROMOVER, tracao.getActionType());
        assertEquals(Recommendation.ActionType.PROMOVER, liquidacao.getActionType());

        // São decisões comerciais opostas: promover um tracionador com desconto
        // de liquidação destrói margem sem necessidade.
        assertTrue(tracao.getCalculationTrace().contains("cesta"),
            "o trace de tracao deve falar do ganho na cesta");
        assertTrue(liquidacao.getCalculationTrace().contains("parado"),
            "o trace de liquidacao deve falar de capital parado");
    }

    @Test
    @DisplayName("preço acima do mercado avisa das limitações da comparação")
    void priceRecommendationStatesLimitations() {
        Recommendation r = captureGenerated(opportunity("PRECO_ACIMA_DO_MERCADO", Map.of(
            "precoPraticado", 12.9, "medianaMercado", 10.5,
            "acimaPercent", 22.8, "observacoes", 6)));

        assertEquals(Recommendation.ActionType.AJUSTAR_PRECO, r.getActionType());
        assertTrue(r.getCalculationTrace().toLowerCase().contains("mediana"),
            "precisa explicar por que usa mediana e nao media");
        assertTrue(r.getCalculationTrace().contains("outra região")
                || r.getCalculationTrace().contains("ATENÇÃO"),
            "precisa sinalizar que a observacao pode nao representar a regiao da loja");
    }

    @Test
    @DisplayName("toda recomendação carrega o cálculo aberto")
    void everyRecommendationExposesItsMath() {
        for (String type : List.of(
                "OPORTUNIDADE_DE_COMPRA", "CAPITAL_PARADO", "EXCESSO_DE_ESTOQUE",
                "PRODUTO_TRACIONADOR", "PRECO_ACIMA_DO_MERCADO", "ANOMALIA_DE_VENDAS")) {
            setUp();
            Recommendation r = captureGenerated(opportunity(type, Map.of(
                "quantidadeSugerida", 10, "giroDiario", 1.0, "coberturaDias", 5,
                "precoPraticado", 10, "medianaMercado", 9, "acimaPercent", 11,
                "receitaRealizada", 100, "receitaEsperada", 200, "desvioPercent", -50,
                "zScore", -3.1)));

            assertNotNull(r.getCalculationTrace(), type + " deveria explicar o calculo");
            assertTrue(r.getCalculationTrace().length() > 40,
                type + ": o trace nao pode ser uma frase vazia");
        }
    }

    @Test
    @DisplayName("tipo sem ação clara não gera recomendação genérica")
    void unknownTypeProducesNothing() {
        Opportunity o = opportunity("TIPO_DESCONHECIDO", Map.of());
        when(opportunityRepository.findOpenByMarket(marketId)).thenReturn(List.of(o));
        when(recommendationRepository.hasActiveForOpportunity(any())).thenReturn(false);

        assertEquals(0, engine.generateForMarket(marketId),
            "melhor nao recomendar do que recomendar generico");
    }

    @Test
    @DisplayName("não duplica recomendação para oportunidade que já tem uma viva")
    void doesNotDuplicateActiveRecommendation() {
        Opportunity o = opportunity("OPORTUNIDADE_DE_COMPRA", Map.of("quantidadeSugerida", 10));
        when(opportunityRepository.findOpenByMarket(marketId)).thenReturn(List.of(o));
        when(recommendationRepository.hasActiveForOpportunity(o.getId())).thenReturn(true);

        assertEquals(0, engine.generateForMarket(marketId));
    }

    @Test
    @DisplayName("aceitar move a oportunidade para EM_ACAO")
    void acceptMovesOpportunityToInAction() {
        Opportunity o = opportunity("OPORTUNIDADE_DE_COMPRA", Map.of());
        Recommendation r = new Recommendation();
        r.setId(UUID.randomUUID());
        r.setOpportunity(o);
        r.setStatus(Recommendation.Status.PROPOSTA);

        when(recommendationRepository.findByIdAndMarketId(r.getId(), marketId))
            .thenReturn(Optional.of(r));
        when(recommendationRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        engine.decide(marketId, r.getId(), Recommendation.Status.ACEITA, "dono@loja", null);

        assertEquals(Recommendation.Status.ACEITA, r.getStatus());
        assertEquals("dono@loja", r.getDecidedBy());
        assertNotNull(r.getDecidedAt());
        assertEquals(Opportunity.Status.EM_ACAO, o.getStatus(),
            "aceita sai de 'decidir' e entra em 'acompanhar'");
    }

    @Test
    @DisplayName("rejeitar descarta a oportunidade com o motivo")
    void rejectDismissesOpportunity() {
        Opportunity o = opportunity("OPORTUNIDADE_DE_COMPRA", Map.of());
        Recommendation r = new Recommendation();
        r.setId(UUID.randomUUID());
        r.setOpportunity(o);
        r.setStatus(Recommendation.Status.PROPOSTA);

        when(recommendationRepository.findByIdAndMarketId(r.getId(), marketId))
            .thenReturn(Optional.of(r));
        when(recommendationRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        engine.decide(marketId, r.getId(), Recommendation.Status.REJEITADA,
            "dono@loja", "vou descontinuar o item");

        assertEquals(Recommendation.Status.REJEITADA, r.getStatus());
        assertEquals(Opportunity.Status.DESCARTADA, o.getStatus());
        assertEquals("vou descontinuar o item", o.getDismissReason(),
            "o motivo da recusa e o que ensina o sistema");
    }
}
