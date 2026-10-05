package com.pdv2cloud.job;

import com.pdv2cloud.service.industry.IndustryBillingService;
import com.pdv2cloud.service.industry.SellOutAggregator;
import com.pdv2cloud.tenancy.TenantContext;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Dados da indústria: a cada hora refaz a semana em curso (com as horas); de
 * madrugada refaz as últimas 6 semanas (notas que chegaram atrasadas); a cada
 * 10 minutos agrega o histórico dos GTINs que acabaram de entrar na carteira;
 * e uma vez por dia emite faturas e suspende contrato com fatura vencida.
 */
@Component
@Profile("jobs")
@Slf4j
public class IndustryDataJob {

    private final SellOutAggregator aggregator;
    private final IndustryBillingService billing;

    public IndustryDataJob(SellOutAggregator aggregator, IndustryBillingService billing) {
        this.aggregator = aggregator;
        this.billing = billing;
    }

    @Scheduled(cron = "0 7 * * * *", zone = "America/Sao_Paulo")
    public void hourly() {
        run("hora", () -> aggregator.rebuildRecent(1, 8));
    }

    @Scheduled(cron = "0 50 3 * * *", zone = "America/Sao_Paulo")
    public void nightly() {
        run("madrugada", () -> aggregator.rebuildRecent(6, 15));
    }

    @Scheduled(fixedDelayString = "600000", initialDelayString = "180000")
    public void backfill() {
        List<String> pending = TenantContext.runAsSystem(aggregator::pendingBackfill);
        if (pending.isEmpty()) {
            return;
        }
        LocalDate thisWeek = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        run("histórico de " + pending.size() + " GTINs", () -> aggregator.rebuild(thisWeek.minusWeeks(55), thisWeek.plusWeeks(1), pending, 15));
    }

    @Scheduled(cron = "0 15 6 * * *", zone = "America/Sao_Paulo")
    public void billing() {
        try {
            Map<String, Integer> r = TenantContext.runAsSystem(billing::daily);
            log.info("Cobrança da indústria | {} faturas emitidas | {} contratos suspensos por atraso", r.get("issued"), r.get("suspended"));
        } catch (RuntimeException e) {
            log.warn("Cobrança da indústria falhou: {}", e.getMessage());
        }
    }

    private void run(String what, java.util.function.Supplier<SellOutAggregator.Result> work) {
        try {
            SellOutAggregator.Result r = TenantContext.runAsSystem(work);
            log.info("Agregado da indústria ({}) | {} a {} | {} GTINs | {} publicadas | {} ocultas | {} lojas | {} ms",
                what, r.from(), r.to(), r.gtins(), r.published(), r.suppressed(), r.stores(), r.millis());
        } catch (RuntimeException e) {
            log.warn("Agregado da indústria ({}) falhou: {}", what, e.getMessage());
        }
    }
}
