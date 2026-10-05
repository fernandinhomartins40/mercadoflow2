package com.pdv2cloud.service.industry;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Regras de anonimato dos dados da indústria. Ficam numa linha do banco, e não
 * no código, para o superadmin ajustar com histórico: afrouxar qualquer regra
 * pede confirmação explícita.
 */
@Service
public class PrivacyPolicyService {

    public record Policy(int minStoresPerCell, BigDecimal maxStoreShare, boolean secondarySuppression,
                         boolean neighborhoodEnabled, boolean hourlyEnabled, int publishDelayMinutes,
                         int categoryMinBrands, BigDecimal categoryMaxBrandShare, int maxQueriesPerDay,
                         String updatedAt, String updatedBy) {

        double share() {
            return maxStoreShare.doubleValue();
        }
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();

    public PrivacyPolicyService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Policy current() {
        return jdbc.queryForObject("select * from mf_privacy_policy where id = 'default'", Map.of(), (rs, i) -> new Policy(
            rs.getInt("min_stores_per_cell"), rs.getBigDecimal("max_store_share"), rs.getBoolean("secondary_suppression"),
            rs.getBoolean("neighborhood_enabled"), rs.getBoolean("hourly_enabled"), rs.getInt("publish_delay_minutes"),
            rs.getInt("category_min_brands"), rs.getBigDecimal("category_max_brand_share"), rs.getInt("max_queries_per_day"),
            String.valueOf(rs.getTimestamp("updated_at").toLocalDateTime()), rs.getString("updated_by")));
    }

    public List<Map<String, Object>> history() {
        return jdbc.queryForList("select changed_at, changed_by, loosened, before::text as before, after::text as after "
            + "from mf_privacy_policy_history order by changed_at desc limit 30", Map.of());
    }

    /**
     * Grava a política. Se alguma regra fica mais fraca que antes, exige
     * {@code confirm = "AFROUXAR"}: menos lojas por célula ou dados mais
     * frescos aumentam o risco de alguém deduzir a loja.
     */
    @Transactional
    public Policy update(Map<String, Object> body, String actor) {
        Policy before = current();
        Policy after = new Policy(
            intIn(body, "minStoresPerCell", before.minStoresPerCell(), 2, 50, "O mínimo de lojas por célula vai de 2 a 50."),
            decIn(body, "maxStoreShare", before.maxStoreShare(), "0.30", "0.95", "A participação máxima de uma loja vai de 30% a 95%."),
            bool(body, "secondarySuppression", before.secondarySuppression()),
            bool(body, "neighborhoodEnabled", before.neighborhoodEnabled()),
            bool(body, "hourlyEnabled", before.hourlyEnabled()),
            intIn(body, "publishDelayMinutes", before.publishDelayMinutes(), 30, 1440, "O atraso de publicação vai de 30 minutos a 24 horas."),
            intIn(body, "categoryMinBrands", before.categoryMinBrands(), 3, 30, "O mínimo de marcas na categoria vai de 3 a 30."),
            decIn(body, "categoryMaxBrandShare", before.categoryMaxBrandShare(), "0.30", "0.90", "A participação máxima de uma marca vai de 30% a 90%."),
            intIn(body, "maxQueriesPerDay", before.maxQueriesPerDay(), 100, 100000, "O limite de consultas por dia vai de 100 a 100.000."),
            null, actor);
        boolean loosened = after.minStoresPerCell() < before.minStoresPerCell()
            || after.maxStoreShare().compareTo(before.maxStoreShare()) > 0
            || (!after.secondarySuppression() && before.secondarySuppression())
            || (after.neighborhoodEnabled() && !before.neighborhoodEnabled())
            || (after.hourlyEnabled() && !before.hourlyEnabled())
            || after.publishDelayMinutes() < before.publishDelayMinutes()
            || after.categoryMinBrands() < before.categoryMinBrands()
            || after.categoryMaxBrandShare().compareTo(before.categoryMaxBrandShare()) > 0
            || after.maxQueriesPerDay() > before.maxQueriesPerDay();
        if (loosened && !"AFROUXAR".equals(body.get("confirm"))) {
            throw new IllegalArgumentException("Esta mudança deixa a proteção mais fraca. Confirme digitando AFROUXAR.");
        }
        jdbc.update("update mf_privacy_policy set min_stores_per_cell = :k, max_store_share = :s, secondary_suppression = :ss, "
            + "neighborhood_enabled = :nb, hourly_enabled = :h, publish_delay_minutes = :d, category_min_brands = :cb, "
            + "category_max_brand_share = :cs, max_queries_per_day = :q, updated_at = now(), updated_by = :a where id = 'default'",
            new MapSqlParameterSource().addValue("k", after.minStoresPerCell()).addValue("s", after.maxStoreShare())
                .addValue("ss", after.secondarySuppression()).addValue("nb", after.neighborhoodEnabled())
                .addValue("h", after.hourlyEnabled()).addValue("d", after.publishDelayMinutes())
                .addValue("cb", after.categoryMinBrands()).addValue("cs", after.categoryMaxBrandShare())
                .addValue("q", after.maxQueriesPerDay()).addValue("a", actor));
        jdbc.update("insert into mf_privacy_policy_history (changed_by, loosened, before, after) "
            + "values (:a, :l, cast(:b as jsonb), cast(:n as jsonb))",
            new MapSqlParameterSource().addValue("a", actor).addValue("l", loosened)
                .addValue("b", toJson(before)).addValue("n", toJson(after)));
        return current();
    }

    private String toJson(Policy p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("minStoresPerCell", p.minStoresPerCell());
        m.put("maxStoreShare", p.maxStoreShare());
        m.put("secondarySuppression", p.secondarySuppression());
        m.put("neighborhoodEnabled", p.neighborhoodEnabled());
        m.put("hourlyEnabled", p.hourlyEnabled());
        m.put("publishDelayMinutes", p.publishDelayMinutes());
        m.put("categoryMinBrands", p.categoryMinBrands());
        m.put("categoryMaxBrandShare", p.categoryMaxBrandShare());
        m.put("maxQueriesPerDay", p.maxQueriesPerDay());
        try {
            return json.writeValueAsString(m);
        } catch (Exception e) {
            return "{}";
        }
    }

    private static int intIn(Map<String, Object> b, String key, int current, int min, int max, String message) {
        Object v = b.get(key);
        if (v == null) {
            return current;
        }
        int n;
        try {
            n = v instanceof Number num ? num.intValue() : Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(message);
        }
        if (n < min || n > max) {
            throw new IllegalArgumentException(message);
        }
        return n;
    }

    private static BigDecimal decIn(Map<String, Object> b, String key, BigDecimal current, String min, String max, String message) {
        Object v = b.get(key);
        if (v == null) {
            return current;
        }
        BigDecimal n;
        try {
            n = new BigDecimal(String.valueOf(v).trim().replace(',', '.'));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(message);
        }
        if (n.compareTo(new BigDecimal(min)) < 0 || n.compareTo(new BigDecimal(max)) > 0) {
            throw new IllegalArgumentException(message);
        }
        return n.setScale(3, java.math.RoundingMode.HALF_UP);
    }

    private static boolean bool(Map<String, Object> b, String key, boolean current) {
        Object v = b.get(key);
        return v == null ? current : Boolean.parseBoolean(String.valueOf(v));
    }
}
