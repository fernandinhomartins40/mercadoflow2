package com.pdv2cloud.job;

import com.pdv2cloud.service.confere.ConfereService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Traz da Sefaz as notas novas de quem cadastrou o certificado A1. Cada
 * mercado tem sua hora marcada (next_sync_at): a Sefaz pede 1 hora de espera
 * quando não há nada novo, e bloqueia quem consulta demais.
 */
@Component
@Profile("jobs")
@Slf4j
public class ConfereSyncJob {

    private final NamedParameterJdbcTemplate jdbc;
    private final ConfereService confere;

    public ConfereSyncJob(NamedParameterJdbcTemplate jdbc, ConfereService confere) {
        this.jdbc = jdbc;
        this.confere = confere;
    }

    @Scheduled(fixedDelayString = "600000", initialDelayString = "90000")
    public void run() {
        List<UUID> due = TenantContext.runAsSystem(() -> jdbc.queryForList(
            "select market_id from confere_certificates where next_sync_at <= now() and not_after > now() " +
            "order by next_sync_at limit 25", Map.of(), UUID.class));
        for (UUID marketId : due) {
            try {
                String status = TenantContext.runAsSystem(() -> confere.sync(marketId));
                log.info("Confere sync | market={} | {}", marketId, status);
            } catch (RuntimeException e) {
                log.warn("Confere sync falhou | market={} | {}", marketId, e.getMessage());
            }
        }
    }
}
