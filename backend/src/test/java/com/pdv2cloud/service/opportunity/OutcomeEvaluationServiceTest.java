package com.pdv2cloud.service.opportunity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.model.entity.RecommendationOutcome;
import com.pdv2cloud.model.entity.RecommendationOutcome.Verdict;
import com.pdv2cloud.repository.RecommendationOutcomeRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.stubbing.Answer;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;

/**
 * Como o sistema julga se acertou.
 *
 * O ponto central destes testes: cada tipo de ação responde a uma pergunta
 * DIFERENTE. Comprar acerta se o produto escoou; liquidar acerta se o estoque
 * saiu; promover acerta se a receita subiu. Um veredito único para todos seria
 * pouco honesto — e é o erro que estes testes impedem de reaparecer.
 */
class OutcomeEvaluationServiceTest {

    private RecommendationOutcomeRepository outcomeRepository;
    private NamedParameterJdbcTemplate jdbcTemplate;
    private OutcomeEvaluationService service;

    private final UUID marketId = UUID.randomUUID();

    /** Valores que o snapshot "depois" devolverá quando o serviço consultar o banco. */
    private double afterQty = 0;
    private double afterRevenue = 0;
    private double afterPrice = 0;

    @BeforeEach
    void setUp() {
        outcomeRepository = mock(RecommendationOutcomeRepository.class);
        jdbcTemplate = mock(NamedParameterJdbcTemplate.class);
        service = new OutcomeEvaluationService(outcomeRepository, jdbcTemplate);

        // O snapshot é montado dentro de um RowCallbackHandler; simulamos o
        // ResultSet devolvendo os valores configurados por cada teste.
        Answer<Void> feedSnapshot = invocation -> {
            RowCallbackHandler handler = invocation.getArgument(2);
            java.sql.ResultSet rs = mock(java.sql.ResultSet.class);
            when(rs.getDouble("quantidade")).thenReturn(afterQty);
            when(rs.getDouble("receita")).thenReturn(afterRevenue);
            when(rs.getDouble("preco_medio")).thenReturn(afterPrice);
            handler.processRow(rs);
            return null;
        };
        org.mockito.Mockito.doAnswer(feedSnapshot)
            .when(jdbcTemplate).query(any(String.class), any(org.springframework.jdbc.core.namedparam.SqlParameterSource.class), any(RowCallbackHandler.class));

        when(outcomeRepository.save(any())).thenAnswer(i -> i.getArgument(0));
    }

    private RecommendationOutcome pending(String actionType, double qtyBefore, double revenueBefore) {
        Market market = new Market();
        market.setId(marketId);

        Product product = new Product();
        product.setId(UUID.randomUUID());
        product.setName("Arroz");

        Opportunity opp = new Opportunity();
        opp.setProduct(product);

        Recommendation rec = new Recommendation();
        rec.setId(UUID.randomUUID());
        rec.setOpportunity(opp);
        rec.setTitle("titulo");

        RecommendationOutcome o = new RecommendationOutcome();
        o.setId(UUID.randomUUID());
        o.setMarket(market);
        o.setProduct(product);
        o.setRecommendation(rec);
        o.setActionType(actionType);
        o.setHorizonDays(30);
        o.setMeasureAfter(LocalDateTime.now().minusDays(1));
        o.setBaselineSnapshot(Map.of(
            "quantidade", qtyBefore, "receita", revenueBefore, "precoMedio", 10.0));
        return o;
    }

    private RecommendationOutcome evaluateWith(RecommendationOutcome pending) {
        when(outcomeRepository.findDueForMeasurement(any(), any())).thenReturn(List.of(pending));
        service.evaluateDue(marketId);

        ArgumentCaptor<RecommendationOutcome> captor =
            ArgumentCaptor.forClass(RecommendationOutcome.class);
        org.mockito.Mockito.verify(outcomeRepository).save(captor.capture());
        return captor.getValue();
    }

    @Test
    @DisplayName("COMPRAR acerta quando o produto manteve o giro")
    void buySucceedsWhenProductKeepsSelling() {
        afterQty = 100;
        afterRevenue = 1000;

        RecommendationOutcome result = evaluateWith(pending("COMPRAR", 100, 1000));

        assertEquals(Verdict.ACERTOU, result.getVerdict());
        assertTrue(result.getNotes().contains("absorvida"),
            "a nota deve explicar que a compra foi absorvida pela demanda");
    }

    @Test
    @DisplayName("COMPRAR erra quando a demanda não sustentou a reposição")
    void buyFailsWhenDemandCollapses() {
        afterQty = 10;
        afterRevenue = 100;

        RecommendationOutcome result = evaluateWith(pending("COMPRAR", 100, 1000));

        assertEquals(Verdict.ERROU, result.getVerdict());
        assertTrue(result.getNotes().contains("prateleira"),
            "a nota deve dizer que o capital ficou parado");
    }

    @Test
    @DisplayName("LIQUIDAR acerta quando o giro SOBE — lógica oposta à de comprar")
    void liquidateSucceedsWhenTurnoverIncreases() {
        afterQty = 150;
        afterRevenue = 900;

        RecommendationOutcome result = evaluateWith(pending("LIQUIDAR", 100, 1000));

        assertEquals(Verdict.ACERTOU, result.getVerdict(),
            "liquidar da certo quando o estoque SAI, mesmo com receita menor");
        assertTrue(result.getNotes().contains("circular") || result.getNotes().contains("girou"));
    }

    @Test
    @DisplayName("o mesmo cenário é ACERTO para liquidar e ERRO para comprar")
    void sameNumbersDifferentVerdictsByAction() {
        // Giro subiu, receita caiu: para liquidação isso é sucesso (o capital
        // saiu); se fosse compra com giro em queda, seria fracasso.
        afterQty = 200;
        afterRevenue = 800;
        RecommendationOutcome liquidar = evaluateWith(pending("LIQUIDAR", 100, 1000));
        assertEquals(Verdict.ACERTOU, liquidar.getVerdict());

        setUp();
        afterQty = 20;
        afterRevenue = 800;
        RecommendationOutcome comprar = evaluateWith(pending("COMPRAR", 100, 1000));
        assertEquals(Verdict.ERROU, comprar.getVerdict());
    }

    @Test
    @DisplayName("PROMOVER acerta quando a receita sobe")
    void promoteSucceedsWhenRevenueGrows() {
        afterQty = 150;
        afterRevenue = 1300;

        RecommendationOutcome result = evaluateWith(pending("PROMOVER", 100, 1000));

        assertEquals(Verdict.ACERTOU, result.getVerdict());
    }

    @Test
    @DisplayName("PROMOVER é ERRO quando o desconto não se pagou")
    void promoteFailsWhenDiscountDoesNotPayOff() {
        afterQty = 200;
        afterRevenue = 500; // muito volume, pouco dinheiro

        RecommendationOutcome result = evaluateWith(pending("PROMOVER", 100, 1000));

        assertEquals(Verdict.ERROU, result.getVerdict());
        assertTrue(result.getNotes().contains("não se pagou"),
            "vender mais por menos dinheiro e margem doada, nao sucesso");
    }

    @Test
    @DisplayName("volume irrelevante devolve SEM_DADOS em vez de inventar veredito")
    void tooLittleVolumeIsHonestlyUndecidable() {
        afterQty = 1;
        afterRevenue = 10;

        RecommendationOutcome result = evaluateWith(pending("COMPRAR", 2, 20));

        assertEquals(Verdict.SEM_DADOS, result.getVerdict());
        assertTrue(result.getNotes().contains("insuficiente"));
        assertNull(result.getActualValue(), "sem dados nao deve produzir numero");
    }

    @Test
    @DisplayName("toda medição registra quando foi feita e o delta")
    void everyMeasurementIsTraceable() {
        afterQty = 120;
        afterRevenue = 1200;

        RecommendationOutcome result = evaluateWith(pending("COMPRAR", 100, 1000));

        assertNotNull(result.getMeasuredAt());
        assertNotNull(result.getActualSnapshot(), "o depois tambem fica registrado");
        assertEquals(BigDecimal.valueOf(200.00).setScale(2), result.getDeltaValue());
        assertEquals(0, result.getDeltaPercent().compareTo(BigDecimal.valueOf(20.00)));
    }

    @Test
    @DisplayName("não cria snapshot duplicado para a mesma recomendação")
    void doesNotDuplicatePendingOutcome() {
        Recommendation rec = pending("COMPRAR", 100, 1000).getRecommendation();
        when(outcomeRepository.findByRecommendationId(rec.getId()))
            .thenReturn(Optional.of(new RecommendationOutcome()));

        assertNull(service.createPending(rec));
    }
}
