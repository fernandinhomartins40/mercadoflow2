package com.pdv2cloud.service.industry;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Leituras do portal da indústria. Tudo aqui roda dentro de
 * {@link IndustryAccessService#asIndustry}: o banco só devolve célula publicada
 * de GTIN aprovado na área do contrato, e o período em curso nunca aparece
 * (semana e dia só completos; hora só depois do atraso de publicação), para
 * que "total menos as partes" não revele o que ainda não passou nas regras.
 */
@Service
public class IndustryDataService {

    private final NamedParameterJdbcTemplate jdbc;
    private final IndustryAccessService access;
    private final PrivacyPolicyService policies;

    public IndustryDataService(NamedParameterJdbcTemplate jdbc, IndustryAccessService access, PrivacyPolicyService policies) {
        this.jdbc = jdbc;
        this.access = access;
        this.policies = policies;
    }

    // ── Resumo ────────────────────────────────────────────────────────────

    public Map<String, Object> overview(IndustryAccessService.Context ctx) {
        Map<String, String> names = productNames(ctx);
        int delay = policies.current().publishDelayMinutes();
        LocalDate today = LocalDate.now();
        Map<String, Object> out = access.asIndustry(ctx, () -> {
            Map<String, Object> o = new LinkedHashMap<>();
            MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("a", Date.valueOf(today.minusDays(7))).addValue("b", Date.valueOf(today))
                .addValue("pa", Date.valueOf(today.minusDays(14)))
                .addValue("ht", Timestamp.valueOf(LocalDateTime.now().minusMinutes(delay).withMinute(0).withSecond(0).withNano(0)));
            p.addValue("hf", Timestamp.valueOf(((Timestamp) p.getValue("ht")).toLocalDateTime().minusHours(24)));

            Map<String, Object> week = jdbc.queryForMap("select coalesce(sum(units) filter (where day >= :a), 0) as units, "
                + "coalesce(sum(revenue) filter (where day >= :a), 0) as revenue, "
                + "coalesce(sum(units) filter (where day < :a), 0) as prev_units, "
                + "coalesce(sum(revenue) filter (where day < :a), 0) as prev_revenue "
                + "from mf_sellout_daily where level = 'UF' and day >= :pa and day < :b", p);
            o.put("week", week);
            o.put("weekGrowthPercent", growth((BigDecimal) week.get("units"), (BigDecimal) week.get("prev_units")));

            if (ctx.has("HORA")) {
                Map<String, Object> h = jdbc.queryForMap("select coalesce(sum(units), 0) as units, coalesce(sum(revenue), 0) as revenue, "
                    + "max(hour) as last_hour from mf_sellout_hourly where level = 'UF' and hour >= :hf and hour < :ht", p);
                o.put("last24h", h);
            }

            List<Map<String, Object>> byProduct = jdbc.queryForList("select gtin, coalesce(sum(units) filter (where day >= :a), 0) as units, "
                + "coalesce(sum(revenue) filter (where day >= :a), 0) as revenue, coalesce(sum(units) filter (where day < :a), 0) as prev_units "
                + "from mf_sellout_daily where level = 'UF' and day >= :pa and day < :b group by gtin order by 2 desc", p);
            byProduct.forEach(r -> {
                r.put("name", names.get((String) r.get("gtin")));
                r.put("growthPercent", growth((BigDecimal) r.get("units"), (BigDecimal) r.get("prev_units")));
            });
            o.put("products", byProduct);

            List<Map<String, Object>> cities = jdbc.queryForList("select uf, city_code, max(city) as city, "
                + "coalesce(sum(units) filter (where day >= :a), 0) as units, coalesce(sum(units) filter (where day < :a), 0) as prev_units "
                + "from mf_sellout_daily where level = 'CIDADE' and day >= :pa and day < :b group by uf, city_code", p);
            cities.forEach(r -> r.put("growthPercent", growth((BigDecimal) r.get("units"), (BigDecimal) r.get("prev_units"))));
            List<Map<String, Object>> movers = new ArrayList<>(cities.stream().filter(r -> r.get("growthPercent") != null).toList());
            movers.sort((x, y) -> ((BigDecimal) y.get("growthPercent")).compareTo((BigDecimal) x.get("growthPercent")));
            o.put("citiesUp", movers.stream().filter(r -> ((BigDecimal) r.get("growthPercent")).signum() > 0).limit(5).toList());
            List<Map<String, Object>> down = new ArrayList<>(movers.stream().filter(r -> ((BigDecimal) r.get("growthPercent")).signum() < 0).toList());
            java.util.Collections.reverse(down);
            o.put("citiesDown", down.stream().limit(5).toList());
            o.put("cities", cities.size());

            if (ctx.has("RUPTURA")) {
                List<Map<String, Object>> alerts = jdbc.queryForList("select week_start, gtin, uf, city_code, city, stores_before, stores_now, "
                    + "stores_stopped from mf_rupture_weekly where level = 'CIDADE' and stores_stopped > 0 "
                    + "and week_start = (select max(week_start) from mf_rupture_weekly where week_start + 7 <= current_date) "
                    + "order by stores_stopped desc, stores_before desc limit 10", Map.of());
                alerts.forEach(r -> r.put("name", names.get((String) r.get("gtin"))));
                o.put("alerts", alerts);
            }
            return o;
        });
        out.put("industry", ctx.industryName());
        out.put("plan", ctx.plan());
        out.put("features", ctx.features());
        out.put("publishDelayMinutes", delay);
        access.log(ctx, "overview", Map.of(), ((List<?>) out.get("products")).size(), 0);
        return out;
    }

    // ── Mapa ──────────────────────────────────────────────────────────────

    /** Lugares do nível pedido, com o período e o período anterior para comparar. */
    public Map<String, Object> map(IndustryAccessService.Context ctx, String level, String uf, String cityCode, String gtin, int days) {
        String lv = switch (level == null ? "UF" : level.toUpperCase()) {
            case "CIDADE" -> "CIDADE";
            case "BAIRRO" -> "BAIRRO";
            default -> "UF";
        };
        int d = Math.max(7, Math.min(days, 365));
        LocalDate today = LocalDate.now();
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("lv", lv)
            .addValue("a", Date.valueOf(today.minusDays(d))).addValue("pa", Date.valueOf(today.minusDays(2L * d)))
            .addValue("b", Date.valueOf(today)).addValue("uf", blank(uf)).addValue("cc", blank(cityCode)).addValue("g", blank(gtin));
        boolean price = ctx.has("PRECO");
        boolean promo = ctx.has("PROMO");
        List<Map<String, Object>> rows = access.asIndustry(ctx, () -> jdbc.queryForList(
            "select uf, city_code, max(city) as city, neighborhood, "
            + "coalesce(sum(units) filter (where day >= :a), 0) as units, coalesce(sum(revenue) filter (where day >= :a), 0) as revenue, "
            + "coalesce(sum(units) filter (where day < :a), 0) as prev_units, "
            + "coalesce(sum(promo_units) filter (where day >= :a), 0) as promo_units, "
            + "min(min_price) filter (where day >= :a) as min_price, max(max_price) filter (where day >= :a) as max_price, "
            + "round(avg(stores) filter (where day >= :a), 1) as avg_stores, max(universe) as universe, "
            + "count(distinct day) filter (where day >= :a) as days_published "
            + "from mf_sellout_daily where level = :lv and day >= :pa and day < :b "
            + "and (cast(:uf as varchar) is null or uf = :uf) and (cast(:cc as varchar) is null or city_code = :cc) "
            + "and (cast(:g as varchar) is null or gtin = :g) "
            + "group by uf, city_code, neighborhood order by 5 desc", p));
        for (Map<String, Object> r : rows) {
            BigDecimal units = (BigDecimal) r.get("units");
            BigDecimal revenue = (BigDecimal) r.get("revenue");
            r.put("growthPercent", growth(units, (BigDecimal) r.get("prev_units")));
            r.put("avgPrice", price && units.signum() > 0 ? revenue.divide(units, 2, RoundingMode.HALF_UP) : null);
            if (!price) {
                r.put("min_price", null);
                r.put("max_price", null);
            }
            r.put("promoSharePercent", promo && units.signum() > 0
                ? ((BigDecimal) r.get("promo_units")).multiply(BigDecimal.valueOf(100)).divide(units, 1, RoundingMode.HALF_UP) : null);
            r.remove("promo_units");
            Object avgStores = r.get("avg_stores");
            Object universe = r.get("universe");
            r.put("distributionPercent", avgStores instanceof BigDecimal s && universe instanceof Number u && u.intValue() > 0
                ? s.multiply(BigDecimal.valueOf(100)).divide(BigDecimal.valueOf(u.intValue()), 0, RoundingMode.HALF_UP) : null);
            if (!"UF".equals(lv) && !"BAIRRO".equals(lv)) {
                r.remove("neighborhood");
            }
        }
        rows.removeIf(r -> ((BigDecimal) r.get("units")).signum() == 0);
        access.log(ctx, "map", filters("level", lv, "uf", uf, "cityCode", cityCode, "gtin", gtin, "days", d), rows.size(), 0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("level", lv);
        out.put("days", d);
        out.put("neighborhoodAllowed", ctx.allowNeighborhood());
        out.put("places", rows);
        return out;
    }

    // ── Produto ───────────────────────────────────────────────────────────

    public Map<String, Object> product(IndustryAccessService.Context ctx, String gtin, String uf, String cityCode, String grain, int days) {
        Map<String, String> names = productNames(ctx);
        if (gtin == null || !names.containsKey(gtin)) {
            throw new IllegalArgumentException("Este produto não está na sua carteira aprovada.");
        }
        boolean weekly = "week".equalsIgnoreCase(grain);
        int d = Math.max(14, Math.min(days, 730));
        String lv = blank(cityCode) != null ? "CIDADE" : "UF";
        LocalDate today = LocalDate.now();
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("g", gtin).addValue("lv", lv)
            .addValue("a", Date.valueOf(today.minusDays(d))).addValue("b", Date.valueOf(today))
            .addValue("uf", blank(uf)).addValue("cc", blank(cityCode));
        boolean price = ctx.has("PRECO");
        boolean promo = ctx.has("PROMO");
        Map<String, Object> out = access.asIndustry(ctx, () -> {
            Map<String, Object> o = new LinkedHashMap<>();
            String table = weekly ? "mf_sellout_weekly" : "mf_sellout_daily";
            String period = weekly ? "week_start" : "day";
            String complete = weekly ? "week_start + 7 <= current_date" : "day < current_date";
            o.put("series", jdbc.queryForList("select " + period + " as period, sum(units) as units, sum(revenue) as revenue, "
                + "sum(promo_units) as promo_units, min(min_price) as min_price, max(max_price) as max_price, sum(stores) as stores "
                + "from " + table + " where gtin = :g and level = :lv and " + period + " >= :a and " + complete + " "
                + "and (cast(:uf as varchar) is null or uf = :uf) and (cast(:cc as varchar) is null or city_code = :cc) "
                + "group by 1 order by 1", p));
            o.put("cities", jdbc.queryForList("select uf, city_code, max(city) as city, sum(units) as units, sum(revenue) as revenue, "
                + "min(min_price) as min_price, max(max_price) as max_price from mf_sellout_daily where gtin = :g and level = 'CIDADE' "
                + "and day >= :a and day < :b and (cast(:uf as varchar) is null or uf = :uf) group by uf, city_code order by 4 desc limit 50", p));
            if (ctx.has("SELLIN")) {
                o.put("sellIn", jdbc.queryForList("select week_start as period, sum(units) as units, sum(stores) as stores "
                    + "from mf_sellin_weekly where gtin = :g and level = :lv and week_start >= :a and week_start + 7 <= current_date "
                    + "and (cast(:uf as varchar) is null or uf = :uf) and (cast(:cc as varchar) is null or city_code = :cc) "
                    + "group by 1 order by 1", p));
            }
            return o;
        });
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> series = (List<Map<String, Object>>) out.get("series");
        for (Map<String, Object> r : series) {
            BigDecimal units = (BigDecimal) r.get("units");
            r.put("avgPrice", price && units != null && units.signum() > 0
                ? ((BigDecimal) r.get("revenue")).divide(units, 2, RoundingMode.HALF_UP) : null);
            r.put("promoSharePercent", promo && units != null && units.signum() > 0 && r.get("promo_units") != null
                ? ((BigDecimal) r.get("promo_units")).multiply(BigDecimal.valueOf(100)).divide(units, 1, RoundingMode.HALF_UP) : null);
            r.remove("promo_units");
            if (!price) {
                r.put("min_price", null);
                r.put("max_price", null);
            }
        }
        if (!price) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> cities = (List<Map<String, Object>>) out.get("cities");
            cities.forEach(c -> {
                c.put("min_price", null);
                c.put("max_price", null);
            });
        }
        out.put("gtin", gtin);
        out.put("name", names.get(gtin));
        out.put("grain", weekly ? "week" : "day");
        access.log(ctx, "product", filters("gtin", gtin, "uf", uf, "cityCode", cityCode, "grain", grain, "days", d), series.size(), 0);
        return out;
    }

    // ── Por hora ──────────────────────────────────────────────────────────

    public Map<String, Object> hourly(IndustryAccessService.Context ctx, String gtin, String uf, String cityCode) {
        if (!ctx.has("HORA")) {
            throw new IndustryAccessService.Denied(403, "A venda por hora faz parte dos pacotes Regional e Nacional.");
        }
        int delay = policies.current().publishDelayMinutes();
        LocalDateTime until = LocalDateTime.now().minusMinutes(delay).withMinute(0).withSecond(0).withNano(0);
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("g", blank(gtin)).addValue("uf", blank(uf)).addValue("cc", blank(cityCode))
            .addValue("lv", blank(cityCode) != null ? "CIDADE" : "UF")
            .addValue("hf", Timestamp.valueOf(until.minusHours(48))).addValue("ht", Timestamp.valueOf(until));
        List<Map<String, Object>> rows = access.asIndustry(ctx, () -> jdbc.queryForList("select hour, sum(units) as units, sum(revenue) as revenue "
            + "from mf_sellout_hourly where level = :lv and hour >= :hf and hour < :ht "
            + "and (cast(:g as varchar) is null or gtin = :g) and (cast(:uf as varchar) is null or uf = :uf) "
            + "and (cast(:cc as varchar) is null or city_code = :cc) group by hour order by hour", p));
        access.log(ctx, "hourly", filters("gtin", gtin, "uf", uf, "cityCode", cityCode), rows.size(), 0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("until", until);
        out.put("delayMinutes", delay);
        out.put("hours", rows);
        return out;
    }

    // ── Categoria ─────────────────────────────────────────────────────────

    public Map<String, Object> category(IndustryAccessService.Context ctx, String uf) {
        if (!ctx.has("CATEGORIA")) {
            throw new IndustryAccessService.Denied(403, "A participação na categoria faz parte do pacote Nacional.");
        }
        Map<String, String> names = productNames(ctx);
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("uf", blank(uf));
        List<Map<String, Object>> rows = access.asIndustry(ctx, () -> jdbc.queryForList(
            "select week_start, category, level, uf, city_code, city, gtin, share_pct from mf_category_share_weekly "
            + "where week_start = (select max(week_start) from mf_category_share_weekly where week_start + 7 <= current_date) "
            + "and (cast(:uf as varchar) is null or uf = :uf) order by category, level desc, city, share_pct desc", p));
        // Participação da empresa na categoria = soma dos GTINs dela no mesmo lugar.
        Map<String, Map<String, Object>> places = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            r.put("name", names.get((String) r.get("gtin")));
            String key = r.get("category") + "|" + r.get("uf") + "|" + r.get("city_code");
            Map<String, Object> pl = places.computeIfAbsent(key, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("category", r.get("category"));
                m.put("level", r.get("level"));
                m.put("uf", r.get("uf"));
                m.put("city", r.get("city"));
                m.put("week_start", r.get("week_start"));
                m.put("sharePercent", BigDecimal.ZERO);
                m.put("products", new ArrayList<Map<String, Object>>());
                return m;
            });
            pl.put("sharePercent", ((BigDecimal) pl.get("sharePercent")).add((BigDecimal) r.get("share_pct")));
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> list = (List<Map<String, Object>>) pl.get("products");
            list.add(Map.of("gtin", r.get("gtin"), "name", String.valueOf(r.get("name")), "sharePercent", r.get("share_pct")));
        }
        access.log(ctx, "category", filters("uf", uf), rows.size(), 0);
        return Map.of("places", new ArrayList<>(places.values()));
    }

    // ── Cobertura ─────────────────────────────────────────────────────────

    public Map<String, Object> coverage(IndustryAccessService.Context ctx) {
        List<Map<String, Object>> rows = access.asIndustry(ctx, () -> jdbc.queryForList(
            "select level, uf, region, city_code, city, stores from mf_coverage order by level desc, stores desc", Map.of()));
        // Faixas, não o número exato: o tamanho da base por cidade não é dado da indústria.
        for (Map<String, Object> r : rows) {
            int s = ((Number) r.remove("stores")).intValue();
            r.put("storesRange", s >= 50 ? "50 ou mais" : s >= 20 ? "20 a 49" : s >= 10 ? "10 a 19" : s >= 5 ? "5 a 9" : "3 a 4");
        }
        access.log(ctx, "coverage", Map.of(), rows.size(), 0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("places", rows);
        out.put("scopeUfs", ctx.scopeUfs());
        out.put("scopeCities", ctx.scopeCities());
        return out;
    }

    // ── Exportação ────────────────────────────────────────────────────────

    public String exportCsv(IndustryAccessService.Context ctx, String level, int days) {
        if (!ctx.has("EXPORTACAO")) {
            throw new IndustryAccessService.Denied(403, "A exportação faz parte do pacote Nacional.");
        }
        Map<String, String> names = productNames(ctx);
        String lv = "BAIRRO".equalsIgnoreCase(level) ? "BAIRRO" : "CIDADE".equalsIgnoreCase(level) ? "CIDADE" : "UF";
        int d = Math.max(7, Math.min(days, 365));
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("lv", lv).addValue("a", Date.valueOf(LocalDate.now().minusDays(d)));
        List<Map<String, Object>> rows = access.asIndustry(ctx, () -> jdbc.queryForList(
            "select day, gtin, uf, city, neighborhood, units, revenue, min_price, avg_price, max_price, stores from mf_sellout_daily "
            + "where level = :lv and day >= :a and day < current_date order by day, gtin, uf, city, neighborhood", p));
        StringBuilder sb = new StringBuilder("dia;gtin;produto;uf;cidade;bairro;unidades;faturamento;preco_min;preco_medio;preco_max;lojas\n");
        for (Map<String, Object> r : rows) {
            sb.append(r.get("day")).append(';').append(r.get("gtin")).append(';')
                .append(csv(names.get((String) r.get("gtin")))).append(';').append(r.get("uf")).append(';')
                .append(csv((String) r.get("city"))).append(';').append(csv("*".equals(r.get("neighborhood")) ? "" : (String) r.get("neighborhood")))
                .append(';').append(r.get("units")).append(';').append(r.get("revenue")).append(';').append(nz(r.get("min_price")))
                .append(';').append(nz(r.get("avg_price"))).append(';').append(nz(r.get("max_price"))).append(';').append(r.get("stores"))
                .append('\n');
        }
        access.log(ctx, "export", filters("level", lv, "days", d), rows.size(), 0);
        return sb.toString();
    }

    // ── Apoio ─────────────────────────────────────────────────────────────

    /** Nomes dos GTINs aprovados da indústria (fora do papel restrito: lê a carteira). */
    public Map<String, String> productNames(IndustryAccessService.Context ctx) {
        Map<String, String> out = new HashMap<>();
        jdbc.query("select gtin, coalesce(product_name, gtin) as name from industry_portfolio where industry_id = :i and status = 'APROVADO'",
            Map.of("i", ctx.industryId()), rs -> {
                out.put(rs.getString("gtin"), rs.getString("name"));
            });
        return out;
    }

    static BigDecimal growth(BigDecimal now, BigDecimal before) {
        if (now == null || before == null || before.signum() <= 0) {
            return null;
        }
        return now.subtract(before).multiply(BigDecimal.valueOf(100)).divide(before, 1, RoundingMode.HALF_UP);
    }

    static String blank(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    private static Map<String, Object> filters(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            if (kv[i + 1] != null) {
                m.put(String.valueOf(kv[i]), kv[i + 1]);
            }
        }
        return m;
    }

    private static String csv(String v) {
        if (v == null) {
            return "";
        }
        String s = v.replace("\"", "\"\"");
        // Fórmula de planilha (=, +, -, @) entra como texto.
        if (!s.isEmpty() && "=+-@".indexOf(s.charAt(0)) >= 0) {
            s = "'" + s;
        }
        return s.contains(";") || s.contains("\n") ? "\"" + s + "\"" : s;
    }

    private static String nz(Object v) {
        return v == null ? "" : String.valueOf(v);
    }
}
