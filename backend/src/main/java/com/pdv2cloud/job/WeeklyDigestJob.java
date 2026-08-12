package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.ai.WeeklyDigestService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Gera o resumo da semana passada, na madrugada de segunda.
 *
 * O horário é a parte que importa: 05:00 de segunda, depois do
 * OutcomeEvaluationJob (04:00 de segunda) e do ciclo noturno inteiro. O
 * lojista abre o sistema na segunda de manhã e o resumo já está pronto —
 * gerá-lo sob demanda faria a primeira visita da semana esperar pelo provedor.
 *
 * Um mercado que falha não derruba os outros, como nos demais jobs.
 */
@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class WeeklyDigestJob {

    private final WeeklyDigestService digestService;
    private final MarketRepository marketRepository;

    public WeeklyDigestJob(
        WeeklyDigestService digestService,
        MarketRepository marketRepository
    ) {
        this.digestService = digestService;
        this.marketRepository = marketRepository;
    }

    @Scheduled(cron = "0 0 5 * * MON")
    public void generateWeeklyDigests() {
        List<Market> markets = TenantContext.runAsSystem(marketRepository::findAllActive);
        log.info("Resumo semanal iniciado para {} mercado(s)", markets.size());

        int generated = 0;
        int skipped = 0;
        int failed = 0;

        for (Market market : markets) {
            try {
                boolean created = TenantContext.runAsSystem(() ->
                    digestService.generateForLastWeek(market.getId()).isPresent());
                if (created) {
                    generated++;
                } else {
                    // Loja sem venda na semana. Não é erro: um resumo sobre o
                    // nada seria pior que a ausência dele.
                    skipped++;
                }
            } catch (Exception e) {
                failed++;
                log.error("Falha ao gerar resumo semanal do mercado {}", market.getId(), e);
            }
        }

        log.info("Resumo semanal concluido: {} gerados, {} sem vendas, {} com falha",
            generated, skipped, failed);
    }
}
