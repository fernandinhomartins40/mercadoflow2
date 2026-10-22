package com.pdv2cloud.job;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.ai.agents.AgentRunner;
import com.pdv2cloud.service.ai.agents.LessonService;
import com.pdv2cloud.service.ai.agents.WhatsAppChannel;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** REC-02: a vigília dos agentes (Jev, WhatsApp, autonomia) não roda para conta que não pode gastar. */
class CopilotAgentsJobTest {

    @Test
    void contaCanceladaSuspensaOuRestritaNaoRodaAgentes() {
        MarketRepository markets = mock(MarketRepository.class);
        AgentRunner runner = mock(AgentRunner.class);
        WhatsAppChannel whatsapp = mock(WhatsAppChannel.class);
        Market active = market(MarketBillingStatus.ACTIVE);
        Market cancelled = market(MarketBillingStatus.CANCELLED);
        Market suspended = market(MarketBillingStatus.SUSPENDED);
        Market restricted = market(MarketBillingStatus.RESTRICTED);
        when(markets.findAllActive()).thenReturn(List.of(active, cancelled, suspended, restricted));
        when(runner.run(any(), anyString())).thenReturn(new AgentRunner.RunResult(0, 0, 0, 0, 0, java.util.Map.of(), 0));

        new CopilotAgentsJob(markets, runner, mock(LessonService.class), whatsapp).watch();

        verify(runner).run(eq(active.getId()), anyString());
        verify(runner, never()).run(eq(cancelled.getId()), anyString());
        verify(runner, never()).run(eq(suspended.getId()), anyString());
        verify(runner, never()).run(eq(restricted.getId()), anyString());
        verify(whatsapp, never()).notify(cancelled.getId());
    }

    private static Market market(MarketBillingStatus status) {
        Market m = new Market();
        m.setId(UUID.randomUUID());
        m.setIsActive(true);
        m.setBillingStatus(status);
        return m;
    }
}
