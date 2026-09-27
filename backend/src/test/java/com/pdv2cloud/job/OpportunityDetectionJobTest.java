package com.pdv2cloud.job;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.service.ProductEventService;
import com.pdv2cloud.service.ai.OpportunityInterpreter;
import com.pdv2cloud.service.opportunity.OpportunityEngine;
import com.pdv2cloud.service.opportunity.OpportunityEngine.DetectionResult;
import com.pdv2cloud.service.opportunity.RecommendationEngine;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OpportunityDetectionJobTest {

    private final OpportunityEngine engine = mock(OpportunityEngine.class);
    private final RecommendationEngine recommendations = mock(RecommendationEngine.class);
    private final MarketRepository markets = mock(MarketRepository.class);
    private final ProductEventService events = mock(ProductEventService.class);
    private final OpportunityDetectionJob job = new OpportunityDetectionJob(
        engine, recommendations, markets, mock(OpportunityRepository.class), mock(OpportunityInterpreter.class), events);

    private Market market(LocalDateTime firstIngestAt) {
        Market m = new Market();
        m.setId(UUID.randomUUID());
        m.setFirstIngestAt(firstIngestAt);
        when(engine.detectForMarket(m.getId())).thenReturn(new DetectionResult(m.getId(), 0, 0, 0, 0, 0, 1));
        return m;
    }

    @Test
    void marcaPrimeiraAnaliseSoParaMercadoComNota() {
        Market comNota = market(LocalDateTime.now().minusDays(1));
        Market semNota = market(null);
        when(markets.findAllActive()).thenReturn(List.of(comNota, semNota));

        job.detectOpportunities();

        verify(events).record(comNota.getId(), ProductEventService.ACTIVATION_FIRST_ANALYSIS);
        verify(events, never()).record(eq(semNota.getId()), anyString());
    }
}
