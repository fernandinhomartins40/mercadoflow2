package com.pdv2cloud.service.opportunity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.repository.RecommendationRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

/** Números do texto da recomendação no formato brasileiro (UX-07). */
class RecommendationTextFormatTest {

    @Test
    @DisplayName("vírgula decimal, ponto de milhar, até 2 casas")
    void formatsNumbers() {
        assertEquals("0,42", RecommendationEngine.num(0.4166666));
        assertEquals("1.234,5", RecommendationEngine.num("1234.5"));
        assertEquals("12", RecommendationEngine.num(12.0));
        assertEquals("R$ 5.893,50", RecommendationEngine.money(5893.5));
        assertEquals("—", RecommendationEngine.num(null));
        assertEquals("A", RecommendationEngine.num("A"));
    }

    @Test
    @DisplayName("trace de promoção sai sem número americano")
    void promotionTraceIsPtBr() {
        OpportunityRepository opportunities = mock(OpportunityRepository.class);
        RecommendationRepository recommendations = mock(RecommendationRepository.class);
        RecommendationEngine engine = new RecommendationEngine(
            opportunities, recommendations, mock(OutcomeEvaluationService.class));

        Product p = new Product();
        p.setId(UUID.randomUUID());
        p.setName("Café 500g");
        Opportunity o = new Opportunity();
        o.setId(UUID.randomUUID());
        o.setType("OPORTUNIDADE_DE_PROMOCAO");
        o.setProduct(p);
        o.setEvidence(Map.of("capitalEmRisco", 5893.5, "coberturaDias", 41.333333,
            "giroDiario", 0.4166666, "descontoSugerido", 12.5, "precoAtual", 18.9, "margemPercent", 30.0));
        o.setExpectedImpactValue(BigDecimal.valueOf(700));
        UUID marketId = UUID.randomUUID();
        Mockito.when(opportunities.findOpenByMarket(marketId)).thenReturn(List.of(o));

        engine.generateForMarket(marketId);

        ArgumentCaptor<Recommendation> saved = ArgumentCaptor.forClass(Recommendation.class);
        Mockito.verify(recommendations).save(saved.capture());
        String trace = saved.getValue().getCalculationTrace();
        assertTrue(trace.contains("R$ 5.893,50"), trace);
        assertTrue(trace.contains("41 dias"), trace);
        assertTrue(trace.contains("0,4 por dia"), trace);
        assertFalse(trace.matches("(?s).*\\d\\.\\d{1,2}(?!\\d).*"), "nenhum decimal com ponto: " + trace);
        assertFalse(trace.contains("0.4166"), trace);
        assertTrue(saved.getValue().getTitle().endsWith("com 12,5% de desconto"), saved.getValue().getTitle());
    }
}
