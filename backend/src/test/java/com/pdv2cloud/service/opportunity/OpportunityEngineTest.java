package com.pdv2cloud.service.opportunity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.service.opportunity.OpportunityDetector.DetectedOpportunity;
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

/**
 * Regras de convivência entre detecção automática e decisão humana.
 *
 * São o coração do Opportunity Engine: sem elas, o feed volta a ser uma lista
 * recalculada que ignora tudo que o usuário já decidiu.
 */
class OpportunityEngineTest {

    private OpportunityRepository opportunityRepository;
    private MarketRepository marketRepository;
    private ProductRepository productRepository;

    private final UUID marketId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        opportunityRepository = mock(OpportunityRepository.class);
        marketRepository = mock(MarketRepository.class);
        productRepository = mock(ProductRepository.class);

        Market market = new Market();
        market.setId(marketId);
        when(marketRepository.getReferenceById(marketId)).thenReturn(market);
    }

    private OpportunityEngine engineWith(DetectedOpportunity... detected) {
        OpportunityDetector detector = new OpportunityDetector() {
            @Override public String name() { return "teste"; }
            @Override public List<DetectedOpportunity> detect(UUID id) { return List.of(detected); }
        };
        return new OpportunityEngine(
            List.of(detector), opportunityRepository, marketRepository, productRepository);
    }

    private DetectedOpportunity sample(String fingerprint) {
        return new DetectedOpportunity(
            fingerprint, "OPORTUNIDADE_DE_COMPRA", "CAPITAL", null,
            "Repor arroz", "cobertura baixa", Map.of("giroDiario", 12.5),
            BigDecimal.valueOf(1500), BigDecimal.valueOf(0.85), BigDecimal.valueOf(88));
    }

    @Test
    @DisplayName("situação nova vira oportunidade")
    void createsNewOpportunity() {
        when(opportunityRepository.findByMarketIdAndFingerprint(eq(marketId), any()))
            .thenReturn(Optional.empty());

        OpportunityEngine engine = engineWith(sample("COMPRA:1"));
        OpportunityEngine.DetectionResult result = engine.detectForMarket(marketId);

        assertEquals(1, result.detected());
        assertEquals(1, result.created());

        ArgumentCaptor<Opportunity> saved = ArgumentCaptor.forClass(Opportunity.class);
        verify(opportunityRepository).save(saved.capture());
        assertEquals(Opportunity.Status.NOVA, saved.getValue().getStatus());
        assertEquals(1, saved.getValue().getDetectionCount());
    }

    @Test
    @DisplayName("mesma situação redetectada NÃO duplica — incrementa a contagem")
    void refreshesInsteadOfDuplicating() {
        Opportunity existing = new Opportunity();
        existing.setStatus(Opportunity.Status.VISTA);
        existing.setDetectionCount(3);

        when(opportunityRepository.findByMarketIdAndFingerprint(marketId, "COMPRA:1"))
            .thenReturn(Optional.of(existing));

        OpportunityEngine engine = engineWith(sample("COMPRA:1"));
        OpportunityEngine.DetectionResult result = engine.detectForMarket(marketId);

        assertEquals(0, result.created(), "nao pode criar linha nova para a mesma situacao");
        assertEquals(1, result.updated());
        assertEquals(4, existing.getDetectionCount(), "persistencia da situacao e sinal");
        assertEquals(Opportunity.Status.VISTA, existing.getStatus(), "status do usuario preservado");
    }

    @Test
    @DisplayName("o que o usuário DESCARTOU não ressuscita")
    void dismissedStaysDismissed() {
        Opportunity dismissed = new Opportunity();
        dismissed.setStatus(Opportunity.Status.DESCARTADA);
        dismissed.setDetectionCount(2);
        dismissed.setTitle("titulo original");

        when(opportunityRepository.findByMarketIdAndFingerprint(marketId, "COMPRA:1"))
            .thenReturn(Optional.of(dismissed));

        OpportunityEngine engine = engineWith(sample("COMPRA:1"));
        OpportunityEngine.DetectionResult result = engine.detectForMarket(marketId);

        assertEquals(0, result.updated(), "redetectar nao pode reabrir o que foi descartado");
        assertEquals(Opportunity.Status.DESCARTADA, dismissed.getStatus());
        assertEquals("titulo original", dismissed.getTitle(), "nem sequer atualiza os campos");
        assertEquals(2, dismissed.getDetectionCount());
    }

    @Test
    @DisplayName("o que o usuário concluiu também não reabre")
    void concludedStaysConcluded() {
        Opportunity concluded = new Opportunity();
        concluded.setStatus(Opportunity.Status.CONCLUIDA);
        concluded.setDetectionCount(1);

        when(opportunityRepository.findByMarketIdAndFingerprint(marketId, "COMPRA:1"))
            .thenReturn(Optional.of(concluded));

        OpportunityEngine engine = engineWith(sample("COMPRA:1"));

        assertEquals(0, engine.detectForMarket(marketId).updated());
        assertEquals(Opportunity.Status.CONCLUIDA, concluded.getStatus());
    }

    @Test
    @DisplayName("detector que estoura não derruba os demais")
    void failingDetectorIsIsolated() {
        OpportunityDetector quebrado = new OpportunityDetector() {
            @Override public String name() { return "quebrado"; }
            @Override public List<DetectedOpportunity> detect(UUID id) {
                throw new IllegalStateException("falha simulada");
            }
        };
        OpportunityDetector saudavel = new OpportunityDetector() {
            @Override public String name() { return "saudavel"; }
            @Override public List<DetectedOpportunity> detect(UUID id) {
                return List.of(sample("COMPRA:ok"));
            }
        };

        when(opportunityRepository.findByMarketIdAndFingerprint(eq(marketId), any()))
            .thenReturn(Optional.empty());

        OpportunityEngine engine = new OpportunityEngine(
            List.of(quebrado, saudavel), opportunityRepository, marketRepository, productRepository);

        OpportunityEngine.DetectionResult result = engine.detectForMarket(marketId);

        assertEquals(1, result.detected(), "o detector saudavel precisa entregar mesmo assim");
        assertEquals(1, result.created());
    }

    @Test
    @DisplayName("reconciliação fecha o obsoleto e expira o vencido")
    void reconcilesStaleAndExpired() {
        when(opportunityRepository.findByMarketIdAndFingerprint(eq(marketId), any()))
            .thenReturn(Optional.empty());
        when(opportunityRepository.closeStale(eq(marketId), any(), any())).thenReturn(4);
        when(opportunityRepository.expireOverdue(eq(marketId), any())).thenReturn(2);

        OpportunityEngine engine = engineWith(sample("COMPRA:1"));
        OpportunityEngine.DetectionResult result = engine.detectForMarket(marketId);

        assertEquals(4, result.closed(), "o que sumiu do detector esta resolvido");
        assertEquals(2, result.expired());
    }

    @Test
    @DisplayName("marcar como vista só afeta o que está NOVA")
    void markSeenOnlyAffectsNew() {
        UUID novaId = UUID.randomUUID();
        UUID emAcaoId = UUID.randomUUID();

        Opportunity nova = new Opportunity();
        nova.setStatus(Opportunity.Status.NOVA);
        Opportunity emAcao = new Opportunity();
        emAcao.setStatus(Opportunity.Status.EM_ACAO);

        when(opportunityRepository.findByIdAndMarketId(novaId, marketId)).thenReturn(Optional.of(nova));
        when(opportunityRepository.findByIdAndMarketId(emAcaoId, marketId)).thenReturn(Optional.of(emAcao));

        OpportunityEngine engine = engineWith();
        int changed = engine.markSeen(marketId, List.of(novaId, emAcaoId));

        assertEquals(1, changed);
        assertEquals(Opportunity.Status.VISTA, nova.getStatus());
        assertEquals(Opportunity.Status.EM_ACAO, emAcao.getStatus(),
            "abrir o feed nao pode regredir uma oportunidade em acompanhamento");
    }

    @Test
    @DisplayName("descartar registra quem e por quê")
    void dismissRecordsActorAndReason() {
        UUID id = UUID.randomUUID();
        Opportunity o = new Opportunity();
        o.setStatus(Opportunity.Status.VISTA);

        when(opportunityRepository.findByIdAndMarketId(id, marketId)).thenReturn(Optional.of(o));
        when(opportunityRepository.save(any(Opportunity.class))).thenAnswer(i -> i.getArgument(0));

        OpportunityEngine engine = engineWith();
        engine.changeStatus(marketId, id, Opportunity.Status.DESCARTADA, "dono@loja", "produto sazonal");

        assertEquals(Opportunity.Status.DESCARTADA, o.getStatus());
        assertEquals("dono@loja", o.getStatusChangedBy());
        assertEquals("produto sazonal", o.getDismissReason());
        assertNotNull(o.getStatusChangedAt());
    }

    @Test
    @DisplayName("isOpen distingue o que ainda pede decisão")
    void isOpenSemantics() {
        Opportunity o = new Opportunity();

        for (Opportunity.Status s : List.of(
                Opportunity.Status.NOVA, Opportunity.Status.VISTA, Opportunity.Status.EM_ACAO)) {
            o.setStatus(s);
            assertTrue(o.isOpen(), s + " deveria contar como aberta");
        }
        for (Opportunity.Status s : List.of(
                Opportunity.Status.CONCLUIDA, Opportunity.Status.DESCARTADA, Opportunity.Status.EXPIRADA)) {
            o.setStatus(s);
            assertTrue(!o.isOpen(), s + " nao deveria contar como aberta");
        }
    }
}
