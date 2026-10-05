package com.pdv2cloud.service.industry;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Se a venda da loja entra (somada com outras lojas, sem o nome dela) nos
 * dados da indústria. Plano Grátis participa sempre; plano pago pode sair.
 */
@Service
public class DataParticipationService {

    public static final String TERMS_VERSION = "2026-10";

    private final NamedParameterJdbcTemplate jdbc;

    public DataParticipationService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, Object> get(UUID marketId) {
        Map<String, Object> m = jdbc.queryForMap("select m.plan_type, dp.status, dp.changed_at, dp.changed_by, "
            + "l.city, l.uf, l.neighborhood from markets m left join market_data_participation dp on dp.market_id = m.id "
            + "left join market_locations l on l.market_id = m.id where m.id = :m", Map.of("m", marketId));
        boolean free = m.get("plan_type") == null || "FREE".equals(m.get("plan_type"));
        boolean left = "SAIU".equals(m.get("status"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("participates", free || !left);
        out.put("canLeave", !free);
        out.put("freePlan", free);
        out.put("changedAt", m.get("changed_at"));
        out.put("located", m.get("city") != null);
        out.put("city", m.get("city"));
        out.put("uf", m.get("uf"));
        out.put("termsVersion", TERMS_VERSION);
        return out;
    }

    @Transactional
    public Map<String, Object> set(UUID marketId, boolean participate, String reason, String actor) {
        Map<String, Object> cur = get(marketId);
        if (!participate && !Boolean.TRUE.equals(cur.get("canLeave"))) {
            throw new IllegalArgumentException("No plano Grátis a participação faz parte do plano. Nos planos pagos você pode sair.");
        }
        jdbc.update("insert into market_data_participation (market_id, status, reason, terms_version, changed_at, changed_by) "
            + "values (:m, :s, :r, :t, now(), :a) on conflict (market_id) do update set status = excluded.status, reason = excluded.reason, "
            + "terms_version = excluded.terms_version, changed_at = now(), changed_by = excluded.changed_by",
            new MapSqlParameterSource().addValue("m", marketId).addValue("s", participate ? "PARTICIPA" : "SAIU")
                .addValue("r", reason == null ? null : reason.length() > 300 ? reason.substring(0, 300) : reason)
                .addValue("t", TERMS_VERSION).addValue("a", actor));
        return get(marketId);
    }

    /** Quantas lojas entram e quantas saíram (superadmin). */
    public Map<String, Object> summary() {
        List<Map<String, Object>> rows = jdbc.queryForList("select coalesce(dp.status, 'PARTICIPA') as status, "
            + "coalesce(m.plan_type, 'FREE') = 'FREE' as free, count(*) as n from markets m "
            + "left join market_data_participation dp on dp.market_id = m.id where coalesce(m.is_active, true) group by 1, 2", Map.of());
        return Map.of("rows", rows);
    }
}
