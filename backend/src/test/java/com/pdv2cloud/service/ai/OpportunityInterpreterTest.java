package com.pdv2cloud.service.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atMost;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.repository.AiInterpretationRepository;
import com.pdv2cloud.repository.RecommendationRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * Proteção da cota do cliente na rodada em lote.
 *
 * Uma loja em produção tem centenas de oportunidades abertas — o mercado de
 * maior volume tinha 584 quando esta fase subiu. Interpretar todas de uma vez
 * estouraria o free tier logo na primeira madrugada, e o circuit breaker
 * desligaria o provedor após o primeiro 429, deixando o resto em fallback de
 * qualquer forma. Estes testes fixam o teto e o comportamento do cache.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OpportunityInterpreterTest {

    @Mock private AiOrchestrator orchestrator;
    @Mock private AiInterpretationRepository interpretationRepository;
    @Mock private RecommendationRepository recommendationRepository;

    private OpportunityInterpreter interpreter;
    private final UUID marketId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        interpreter = new OpportunityInterpreter(orchestrator, new AiContextBuilder(),
            interpretationRepository, recommendationRepository);
        // Sem a pausa real: verificar o teto com 1,5 s entre chamadas custaria
        // um minuto de suíte sem provar nada além do que um sleep já prova.
        interpreter.setThrottleMillis(0);
        when(orchestrator.isEnabledFor(marketId)).thenReturn(true);
        when(recommendationRepository.findByOpportunityId(any())).thenReturn(List.of());
    }

    /** Mercado sem chave nem tenta: nenhuma chamada, nenhum custo. */
    @Test
    void mercadoSemCredencialNaoInterpreta() {
        when(orchestrator.isEnabledFor(marketId)).thenReturn(false);

        assertEquals(0, interpreter.interpretMarket(marketId, opportunities(50)));

        verify(orchestrator, never()).interpret(any(), anyString(), anyString(), any(),
            any(), anyString(), anyString(), anyString());
    }

    /**
     * O teto corta a rodada. Sem ele, 584 oportunidades virariam 584 chamadas
     * seguidas — e a conta é do cliente.
     */
    @Test
    void tetoLimitaAsChamadasAoProvedor() {
        when(orchestrator.interpret(any(), anyString(), anyString(), any(), any(),
            anyString(), anyString(), anyString()))
            .thenAnswer(inv -> new AiOrchestrator.Interpretation("texto da ia", false, "GROQ", false));

        interpreter.interpretMarket(marketId, opportunities(200));

        // 40 é o teto; o importante é que não passe dele nem de longe.
        verify(orchestrator, atMost(40)).interpret(any(), anyString(), anyString(), any(),
            any(), anyString(), anyString(), anyString());
    }

    /**
     * Resposta de cache não gasta o teto: uma rodada em que tudo já foi
     * interpretado avança para as oportunidades ainda sem leitura, em vez de
     * parar nas 40 primeiras para sempre.
     */
    @Test
    void respostaDeCacheNaoConsomeOTeto() {
        when(orchestrator.interpret(any(), anyString(), anyString(), any(), any(),
            anyString(), anyString(), anyString()))
            .thenAnswer(inv -> new AiOrchestrator.Interpretation("já feito", false, "GROQ", true));

        int done = interpreter.interpretMarket(marketId, opportunities(120));

        assertEquals(120, done, "cache não consome o teto, então todas são percorridas");
    }

    /** Fallback não conta como interpretada — o número reportado seria mentira. */
    @Test
    void fallbackNaoContaComoInterpretada() {
        when(orchestrator.interpret(any(), anyString(), anyString(), any(), any(),
            anyString(), anyString(), anyString()))
            .thenAnswer(inv -> new AiOrchestrator.Interpretation("texto do sistema", true, null, false));

        assertEquals(0, interpreter.interpretMarket(marketId, opportunities(5)));
    }

    /** Erro numa oportunidade não derruba as outras (regra das Fases 3 e 4). */
    @Test
    void erroNumaOportunidadeNaoDerrubaAsOutras() {
        when(orchestrator.interpret(any(), anyString(), anyString(), any(), any(),
            anyString(), anyString(), anyString()))
            .thenThrow(new RuntimeException("provedor explodiu"))
            .thenAnswer(inv -> new AiOrchestrator.Interpretation("ok", false, "GROQ", true));

        assertEquals(4, interpreter.interpretMarket(marketId, opportunities(5)));
    }

    /**
     * O fallback usa a descrição do detector e a justificativa da recomendação
     * — não é um placeholder, é o texto que o produto já entregava.
     */
    @Test
    void fallbackUsaDescricaoDoSistemaEJustificativaDaRecomendacao() {
        Opportunity o = opportunity(1);
        o.setDescription("Capital parado na prateleira.");

        Recommendation r = new Recommendation();
        r.setRationale("Liquidar libera R$ 1.200.");

        String texto = interpreter.fallbackText(o, List.of(r));

        assertTrue(texto.contains("Capital parado na prateleira."));
        assertTrue(texto.contains("Liquidar libera R$ 1.200."));
    }

    private List<Opportunity> opportunities(int howMany) {
        List<Opportunity> list = new ArrayList<>(howMany);
        for (int i = 0; i < howMany; i++) {
            list.add(opportunity(i));
        }
        return list;
    }

    private Opportunity opportunity(int seed) {
        Opportunity o = new Opportunity();
        o.setId(UUID.randomUUID());
        o.setType("CAPITAL_PARADO");
        o.setSource("CAPITAL");
        o.setTitle("Oportunidade " + seed);
        o.setEvidence(Map.of("giroDiario", new BigDecimal("0.5")));
        o.setFirstDetectedAt(LocalDateTime.now().minusDays(3));
        o.setLastDetectedAt(LocalDateTime.now());
        o.setDetectionCount(1);
        return o;
    }
}
