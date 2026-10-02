package com.pdv2cloud.service.billing;

import com.pdv2cloud.model.entity.PlanType;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * O que cada plano dá, lido do catálogo (plan_features), e não do código.
 *
 * A vitrine de planos e as checagens do sistema perguntam aqui, então o que é
 * vendido é o que é entregue. O superadmin muda um recurso sem deploy; vale
 * para todos os assinantes do plano, com registro da mudança.
 *
 * Recurso sem linha no catálogo cai na escada antiga do enum (reserva), para
 * nada sumir se a tabela estiver incompleta.
 */
@Service
public class Entitlements {

    public record Definition(String key, String label, String kind, String unit, String group, int sortOrder) {}

    public record Value(boolean enabled, Integer amount) {}

    public record FeatureView(String key, String label, String kind, String unit, String group, boolean enabled, Integer amount) {}

    private static final long TTL_MS = 60_000;

    private final NamedParameterJdbcTemplate jdbc;
    private volatile Map<String, Map<String, Value>> cache = Map.of();
    private volatile List<Definition> definitions = List.of();
    private volatile long loadedAt = 0;

    public Entitlements(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ── Perguntas do sistema ─────────────────────────────────────────────

    /** O plano da rede deste mercado tem o recurso ligado? */
    public boolean has(UUID marketId, String feature) {
        return has(planOf(marketId), feature);
    }

    public boolean has(PlanType plan, String feature) {
        Value v = value(plan, feature);
        return v != null ? v.enabled() : fallbackBool(plan, feature);
    }

    /** Quantidade do recurso (dias, créditos); {@code fallback} se não houver no catálogo. */
    public int amount(UUID marketId, String feature, int fallback) {
        return amount(planOf(marketId), feature, fallback);
    }

    public int amount(PlanType plan, String feature, int fallback) {
        Value v = value(plan, feature);
        return v != null && v.enabled() && v.amount() != null ? v.amount() : v != null && !v.enabled() ? 0 : fallback;
    }

    /** O plano que vale para a rede (o espelho da assinatura na matriz). */
    public PlanType planOf(UUID marketId) {
        List<String> r = jdbc.queryForList("select coalesce(p.plan_type, m.plan_type) from markets m "
            + "left join markets p on p.id = m.parent_market_id where m.id = :m", Map.of("m", marketId), String.class);
        return r.isEmpty() ? PlanType.FREE : PlanType.fromString(r.get(0));
    }

    // ── Vitrine e painel ─────────────────────────────────────────────────

    public List<Definition> definitions() {
        load();
        return definitions;
    }

    /** Recursos do plano na ordem da vitrine. */
    public List<FeatureView> featuresOf(PlanType plan) {
        load();
        Map<String, Value> values = cache.getOrDefault(plan.name(), Map.of());
        List<FeatureView> out = new ArrayList<>();
        for (Definition d : definitions) {
            Value v = values.get(d.key());
            boolean enabled = v != null ? v.enabled() : fallbackBool(plan, d.key());
            out.add(new FeatureView(d.key(), d.label(), d.kind(), d.unit(), d.group(), enabled, v == null ? null : v.amount()));
        }
        return out;
    }

    /** Matriz completa para o superadmin: plano → recurso → valor. */
    public Map<String, List<FeatureView>> matrix() {
        Map<String, List<FeatureView>> out = new LinkedHashMap<>();
        for (PlanType p : List.of(PlanType.FREE, PlanType.ESSENCIAL, PlanType.PROFISSIONAL, PlanType.REDE)) {
            out.put(p.name(), featuresOf(p));
        }
        return out;
    }

    /** Muda um recurso de um plano (vale para todos os assinantes do plano). */
    @Transactional
    public Map<String, List<FeatureView>> save(String planCode, String feature, Boolean enabled, Integer amount, String actor) {
        PlanType plan = PlanType.fromString(planCode);
        if (!plan.name().equals(planCode)) {
            throw new IllegalArgumentException("Plano desconhecido");
        }
        Definition def = definitions().stream().filter(d -> d.key().equals(feature)).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Recurso desconhecido"));
        if ("NUMBER".equals(def.kind()) && amount != null && (amount < 0 || amount > 1_000_000)) {
            throw new IllegalArgumentException("Quantidade inválida");
        }
        Value old = value(plan, feature);
        boolean on = enabled != null ? enabled : old == null || old.enabled();
        Integer qty = "NUMBER".equals(def.kind()) ? (amount != null ? amount : old == null ? null : old.amount()) : null;
        jdbc.update("insert into plan_features (plan_code, feature_key, enabled, amount, updated_by) values (:p, :k, :e, :a, :u) "
                + "on conflict (plan_code, feature_key) do update set enabled = excluded.enabled, amount = excluded.amount, "
                + "updated_at = now(), updated_by = excluded.updated_by",
            new MapSqlParameterSource().addValue("p", plan.name()).addValue("k", feature).addValue("e", on).addValue("a", qty)
                .addValue("u", actor));
        jdbc.update("insert into plan_feature_changes (plan_code, feature_key, old_value, new_value, actor) values (:p, :k, :o, :n, :u)",
            new MapSqlParameterSource().addValue("p", plan.name()).addValue("k", feature).addValue("o", describe(old))
                .addValue("n", describe(new Value(on, qty))).addValue("u", actor));
        invalidate();
        return matrix();
    }

    public void invalidate() {
        loadedAt = 0;
    }

    // ── Apoio ────────────────────────────────────────────────────────────

    private Value value(PlanType plan, String feature) {
        load();
        Map<String, Value> v = cache.get((plan == null ? PlanType.FREE : plan).name());
        return v == null ? null : v.get(feature);
    }

    private void load() {
        if (System.currentTimeMillis() - loadedAt < TTL_MS) {
            return;
        }
        synchronized (this) {
            if (System.currentTimeMillis() - loadedAt < TTL_MS) {
                return;
            }
            Map<String, Map<String, Value>> fresh = new HashMap<>();
            jdbc.query("select plan_code, feature_key, enabled, amount from plan_features", Map.of(), rs -> {
                fresh.computeIfAbsent(rs.getString("plan_code"), k -> new HashMap<>())
                    .put(rs.getString("feature_key"), new Value(rs.getBoolean("enabled"), (Integer) rs.getObject("amount")));
            });
            definitions = jdbc.query("select * from plan_feature_definitions order by sort_order, feature_key", Map.of(),
                (rs, i) -> new Definition(rs.getString("feature_key"), rs.getString("label"), rs.getString("kind"),
                    rs.getString("unit"), rs.getString("group_name"), rs.getInt("sort_order")));
            cache = fresh;
            loadedAt = System.currentTimeMillis();
        }
    }

    private static String describe(Value v) {
        if (v == null) {
            return null;
        }
        return v.enabled() ? (v.amount() == null ? "sim" : String.valueOf(v.amount())) : "não";
    }

    /** Escada antiga (enum), usada só se faltar a linha no catálogo. */
    static boolean fallbackBool(PlanType plan, String feature) {
        PlanType p = plan == null ? PlanType.FREE : plan;
        boolean advanced = p.getIntelligenceTier().reaches(PlanType.IntelligenceTier.AVANCADO);
        boolean paid = p != PlanType.FREE;
        return switch (feature) {
            case "network_intelligence", "customer_intelligence", "price_simulation", "full_outcomes", "data_export",
                 "copilot_whatsapp", "copilot_autonomy" -> advanced;
            case "copilot_questions", "copilot_agents" -> paid;
            default -> true;
        };
    }
}
