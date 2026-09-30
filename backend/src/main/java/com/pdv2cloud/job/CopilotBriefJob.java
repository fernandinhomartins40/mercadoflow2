package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.ai.platform.DailyBriefService;
import com.pdv2cloud.tenancy.TenantContext;
import java.time.LocalDate;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Resumo do dia do Copiloto, às 6h: texto pronto (sem IA, custo zero) para
 * todos os mercados ativos, pronto para o lojista ler ou ouvir ao acordar.
 */
@Component
@Profile("jobs")
@Slf4j
public class CopilotBriefJob {

    private final MarketRepository markets;
    private final DailyBriefService briefs;

    public CopilotBriefJob(MarketRepository markets, DailyBriefService briefs) {
        this.markets = markets;
        this.briefs = briefs;
    }

    @Scheduled(cron = "0 0 6 * * *", zone = "America/Sao_Paulo")
    public void run() {
        List<Market> active = TenantContext.runAsSystem(markets::findAllActive);
        int ok = 0;
        for (Market m : active) {
            try {
                TenantContext.runAsSystem(() -> briefs.generate(m.getId(), LocalDate.now()));
                ok++;
            } catch (RuntimeException e) {
                log.warn("Resumo do dia falhou no mercado {}: {}", m.getId(), e.getMessage());
            }
        }
        log.info("Resumo do dia gerado para {} de {} mercados", ok, active.size());
    }
}
