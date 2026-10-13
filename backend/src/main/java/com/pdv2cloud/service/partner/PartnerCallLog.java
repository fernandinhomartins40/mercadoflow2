package com.pdv2cloud.service.partner;

import com.pdv2cloud.tenancy.TenantContext;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** Cada chamada do parceiro, visível ao lojista em Integrações. */
@Service
@Profile("!jobs")
public class PartnerCallLog {

    private final NamedParameterJdbcTemplate jdbc;

    public PartnerCallLog(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void record(UUID partnerId, UUID marketId, String method, String path, PartnerIngestService.BatchResult r, int status) {
        TenantContext.runAsSystem(() -> jdbc.update(
            "insert into partner_api_log (partner_id, market_id, method, path, items, accepted, rejected, status, dry_run) " +
            "values (:p, :m, :me, :pa, :i, :a, :r, :s, :d)",
            new MapSqlParameterSource("p", partnerId).addValue("m", marketId).addValue("me", method).addValue("pa", path)
                .addValue("i", r == null ? 0 : r.received()).addValue("a", r == null ? 0 : r.accepted())
                .addValue("r", r == null ? 0 : r.rejected()).addValue("s", status).addValue("d", r != null && r.dryRun())));
    }

    /** Leitura: quantos itens saíram. */
    public void read(UUID partnerId, UUID marketId, String path, int items) {
        record(partnerId, marketId, "GET", path, new PartnerIngestService.BatchResult(items, items, 0, false, java.util.List.of()), 200);
    }
}
