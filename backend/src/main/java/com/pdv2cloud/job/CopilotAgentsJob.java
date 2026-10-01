package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.ai.agents.AgentRunner;
import com.pdv2cloud.service.ai.agents.LessonService;
import com.pdv2cloud.service.ai.agents.WhatsAppChannel;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Vigília dos agentes do Copiloto. A cada 5 minutos o funil roda por mercado:
 * consultas ao banco e, só para o sinal que passa pela memória, uma decisão do
 * Jev. Nenhum modelo de linguagem é chamado aqui. Depois, os avisos pelo
 * WhatsApp de quem aceitou receber.
 */
@Component
@Profile("jobs")
@Slf4j
public class CopilotAgentsJob {

    private final MarketRepository markets;
    private final AgentRunner runner;
    private final LessonService lessons;
    private final WhatsAppChannel whatsapp;

    public CopilotAgentsJob(MarketRepository markets, AgentRunner runner, LessonService lessons, WhatsAppChannel whatsapp) {
        this.markets = markets;
        this.runner = runner;
        this.lessons = lessons;
        this.whatsapp = whatsapp;
    }

    @Scheduled(fixedDelay = 300_000, initialDelay = 120_000)
    public void watch() {
        List<Market> active = TenantContext.runAsSystem(markets::findAllActive);
        int created = 0;
        for (Market m : active) {
            if (m.getBillingStatus() == com.pdv2cloud.model.entity.MarketBillingStatus.RESTRICTED) {
                continue; // conta só para consulta: agentes e avisos param até o pagamento
            }
            try {
                created += TenantContext.runAsSystem(() -> runner.run(m.getId(), "HORARIO").created());
                // Canal: só para quem aceitou receber, fora do silêncio (texto pronto, sem IA).
                TenantContext.runAsSystem(() -> whatsapp.notify(m.getId()));
            } catch (RuntimeException e) {
                log.warn("Vigília dos agentes falhou no mercado {}: {}", m.getId(), e.getMessage());
            }
        }
        if (created > 0) {
            log.info("Vigília dos agentes: {} decisões novas", created);
        }
    }

    /** Lições a partir dos resultados medidos (a avaliação roda às 4h de segunda; aqui todo dia, é só consulta). */
    @Scheduled(cron = "0 30 4 * * *", zone = "America/Sao_Paulo")
    public void learn() {
        for (Market m : TenantContext.runAsSystem(markets::findAllActive)) {
            try {
                TenantContext.runAsSystem(() -> lessons.refreshOutcomes(m.getId()));
            } catch (RuntimeException e) {
                log.warn("Lições do mercado {} falharam: {}", m.getId(), e.getMessage());
            }
        }
    }
}
