package com.pdv2cloud.service.industry;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Service;

/**
 * Agregado anônimo de venda (sell-out) para a indústria.
 *
 * Lê as notas do caixa das lojas participantes e grava, por GTIN, quanto saiu
 * em cada UF, cidade e bairro, por semana, dia e hora. A loja é descartada
 * antes de gravar; o que sobra só é publicado se não der para deduzir a loja:
 *
 *  1. Mínimo de lojas na célula e nenhuma loja acima da participação máxima.
 *  2. Supressão secundária no espaço: se a cidade é publicada, o que sobra
 *     dela sem os bairros publicados também precisa passar na regra 1; senão
 *     mais bairros são ocultados. O mesmo entre a UF e as cidades.
 *  3. Supressão secundária no tempo: a semana menos os dias publicados, e o
 *     dia menos as horas publicadas, também precisam passar na regra 1.
 *  4. Pai oculto por proteção (regras 2 e 3) oculta os filhos: senão a soma
 *     deles reconstruiria o pai.
 *
 * Só entram GTINs que alguma indústria pediu ou tem aprovados: o que ninguém
 * contratou não é agregado (minimização de dados).
 */
@Service
@Slf4j
public class SellOutAggregator {

    static final String UF = "UF";
    static final String CIDADE = "CIDADE";
    static final String BAIRRO = "BAIRRO";
    /** Lojas sem bairro: filho virtual da cidade, nunca publicado. */
    static final String SEM_BAIRRO = "SEM_BAIRRO";

    static final String POUCAS_LOJAS = "POUCAS_LOJAS";
    static final String DOMINANCIA = "DOMINANCIA";
    static final String SECUNDARIA = "SECUNDARIA";
    static final String TEMPORAL = "TEMPORAL";
    static final String PAI_OCULTO = "PAI_OCULTO";
    static final String DESLIGADO = "DESLIGADO";

    /** GTIN canônico: sem zeros à esquerda e com 13 dígitos quando cabe (GTIN-8/12/13 iguais). */
    static final String CANON = "(case when length(ltrim(%1$s, '0')) <= 13 then lpad(ltrim(%1$s, '0'), 13, '0') else ltrim(%1$s, '0') end)";

    private final NamedParameterJdbcTemplate jdbc;
    private final PrivacyPolicyService policies;

    public SellOutAggregator(NamedParameterJdbcTemplate jdbc, PrivacyPolicyService policies) {
        this.jdbc = jdbc;
        this.policies = policies;
    }

    public record Result(LocalDate from, LocalDate to, int gtins, int published, int suppressed, int stores, long millis) {}

    // ── Estruturas ────────────────────────────────────────────────────────

    record Loc(String uf, String cityCode, String city, String nb) {}

    record GeoKey(String level, String uf, String cityCode, String nb) {
        GeoKey parent() {
            return switch (level) {
                case BAIRRO, SEM_BAIRRO -> new GeoKey(CIDADE, uf, cityCode, "*");
                case CIDADE -> new GeoKey(UF, uf, "*", "*");
                default -> null;
            };
        }
    }

    static final class Agg {
        double units;
        double revenue;
        double promo;
        double mn = Double.MAX_VALUE;
        double mx = -Double.MAX_VALUE;

        void add(double u, double r, double p, double lo, double hi) {
            units += u;
            revenue += r;
            promo += p;
            mn = Math.min(mn, lo);
            mx = Math.max(mx, hi);
        }

        void add(Agg o) {
            add(o.units, o.revenue, o.promo, o.mn, o.mx);
        }
    }

    /** Uma célula: um GTIN, um período, um lugar, com a soma por loja. */
    static final class Cell {
        final GeoKey key;
        final String city;
        final Map<UUID, Agg> stores = new HashMap<>();
        boolean published;
        String reason;

        Cell(GeoKey key, String city) {
            this.key = key;
            this.city = city;
        }

        boolean virtual() {
            return SEM_BAIRRO.equals(key.level());
        }

        double units() {
            double s = 0;
            for (Agg a : stores.values()) {
                s += a.units;
            }
            return s;
        }

        void hide(String why) {
            if (published) {
                published = false;
                reason = why;
            }
        }
    }

    /** Linha lida do banco: uma loja, um GTIN, um dia (ou hora). */
    record Row(UUID market, String gtin, int slot, double units, double revenue, double promo, double mn, double mx,
               String category, String brand) {}

    // ── Entrada pública ───────────────────────────────────────────────────

    /** Semanas recentes (job a cada hora: atual e anterior; de madrugada: 6). */
    public Result rebuildRecent(int weeks, int hourlyDays) {
        LocalDate thisWeek = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        return rebuild(thisWeek.minusWeeks(Math.max(1, weeks) - 1L), thisWeek.plusWeeks(1), null, hourlyDays);
    }

    /**
     * Recalcula [fromWeek, toWeek) para os GTINs dados (null = todos os que
     * alguma indústria acompanha). Horas só para os últimos {@code hourlyDays}.
     */
    public Result rebuild(LocalDate fromWeek, LocalDate toWeek, Collection<String> onlyGtins, int hourlyDays) {
        long t0 = System.currentTimeMillis();
        PrivacyPolicyService.Policy policy = policies.current();
        Set<String> tracked = trackedGtins(onlyGtins);
        Long runId = jdbc.queryForObject("insert into mf_aggregation_runs (kind, from_day, to_day) values ('SELLOUT', :f, :t) returning id",
            new MapSqlParameterSource().addValue("f", Date.valueOf(fromWeek)).addValue("t", Date.valueOf(toWeek)), Long.class);
        int[] counts = new int[2];
        int stores = 0;
        try {
            LocalDate hourlyFrom = LocalDate.now().minusDays(Math.max(0, hourlyDays - 1L));
            for (LocalDate ws = fromWeek; ws.isBefore(toWeek); ws = ws.plusWeeks(1)) {
                stores = Math.max(stores, rebuildWeek(ws, tracked, policy, hourlyDays > 0 ? hourlyFrom : null, counts));
            }
            if (!toWeek.isBefore(LocalDate.now())) {
                rebuildCoverage(policy);
            }
            jdbc.update("delete from mf_sellout_hourly where hour < :h", Map.of("h", Timestamp.valueOf(LocalDateTime.now().minusDays(15))));
            jdbc.update("update mf_aggregation_runs set finished_at = now(), published = :p, suppressed = :s, stores = :n where id = :id",
                new MapSqlParameterSource().addValue("p", counts[0]).addValue("s", counts[1]).addValue("n", stores).addValue("id", runId));
            if (onlyGtins != null) {
                jdbc.update("update industry_portfolio set aggregated_at = now() where gtin in (:g) and status in ('PEDIDO', 'APROVADO')",
                    Map.of("g", onlyGtins.isEmpty() ? List.of("-") : onlyGtins));
            }
        } catch (RuntimeException e) {
            jdbc.update("update mf_aggregation_runs set finished_at = now(), error = :e where id = :id",
                new MapSqlParameterSource().addValue("e", cut(e.getMessage(), 500)).addValue("id", runId));
            throw e;
        }
        return new Result(fromWeek, toWeek, tracked.size(), counts[0], counts[1], stores, System.currentTimeMillis() - t0);
    }

    /** GTINs que entraram na carteira e ainda não têm histórico agregado. */
    public List<String> pendingBackfill() {
        return jdbc.queryForList("select distinct gtin from industry_portfolio where status in ('PEDIDO', 'APROVADO') "
            + "and aggregated_at is null order by gtin limit 500", Map.of(), String.class);
    }

    // ── Uma semana ────────────────────────────────────────────────────────

    private int rebuildWeek(LocalDate ws, Set<String> tracked, PrivacyPolicyService.Policy policy, LocalDate hourlyFrom, int[] counts) {
        LocalDate we = ws.plusWeeks(1);
        MapSqlParameterSource range = new MapSqlParameterSource()
            .addValue("from", Timestamp.valueOf(ws.atStartOfDay())).addValue("to", Timestamp.valueOf(we.atStartOfDay()))
            .addValue("gtins", tracked.isEmpty() ? List.of("-") : tracked);
        deleteWeek(ws, we, tracked, hourlyFrom != null && policy.hourlyEnabled() ? hourlyFrom : null);
        if (tracked.isEmpty()) {
            return 0;
        }
        Map<UUID, Loc> locations = participatingLocations(ws.minusDays(30), we);
        Map<GeoKey, Integer> universe = universe(locations.values());

        List<Row> rows = new ArrayList<>();
        jdbc.query(storeRowsSql("cast(i.data_emissao as date) - cast(:from as date)"), range,
            rs -> {
                rows.add(row(rs));
            });

        // Semana: soma por loja dos dias.
        Map<String, Map<UUID, Agg>> weekByGtin = new HashMap<>();
        Map<String, Map<Integer, Map<UUID, Agg>>> dayByGtin = new HashMap<>();
        Map<String, String[]> catBrand = new HashMap<>();
        for (Row r : rows) {
            if (!locations.containsKey(r.market())) {
                continue;
            }
            weekByGtin.computeIfAbsent(r.gtin(), g -> new HashMap<>()).computeIfAbsent(r.market(), m -> new Agg())
                .add(r.units(), r.revenue(), r.promo(), r.mn(), r.mx());
            dayByGtin.computeIfAbsent(r.gtin(), g -> new HashMap<>()).computeIfAbsent(r.slot(), d -> new HashMap<>())
                .computeIfAbsent(r.market(), m -> new Agg()).add(r.units(), r.revenue(), r.promo(), r.mn(), r.mx());
            if (r.category() != null && !r.category().isBlank()) {
                catBrand.putIfAbsent(r.gtin(), new String[] {r.category().trim(), brandOf(r.gtin(), r.brand())});
            }
        }

        List<SqlParameterSource> weekly = new ArrayList<>();
        List<SqlParameterSource> daily = new ArrayList<>();
        List<SqlParameterSource> hourly = new ArrayList<>();
        Map<String, Map<Integer, Map<GeoKey, Cell>>> dayCellsByGtin = new HashMap<>();

        for (Map.Entry<String, Map<UUID, Agg>> e : weekByGtin.entrySet()) {
            String gtin = e.getKey();
            Map<GeoKey, Cell> weekCells = cells(e.getValue(), locations, policy, true);
            protectGeo(weekCells, policy);

            Map<Integer, Map<GeoKey, Cell>> days = new LinkedHashMap<>();
            for (Map.Entry<Integer, Map<UUID, Agg>> d : dayByGtin.getOrDefault(gtin, Map.of()).entrySet()) {
                Map<GeoKey, Cell> dc = cells(d.getValue(), locations, policy, true);
                protectGeo(dc, policy);
                days.put(d.getKey(), dc);
            }
            protectTime(weekCells, days.values(), policy);
            dayCellsByGtin.put(gtin, days);

            for (Cell c : weekCells.values()) {
                if (!c.virtual()) {
                    weekly.add(cellParams(c, gtin, universe).addValue("p", Date.valueOf(ws)));
                    count(c, counts);
                }
            }
            for (Map.Entry<Integer, Map<GeoKey, Cell>> d : days.entrySet()) {
                LocalDate day = ws.plusDays(d.getKey());
                for (Cell c : d.getValue().values()) {
                    if (!c.virtual()) {
                        daily.add(cellParams(c, gtin, universe).addValue("p", Date.valueOf(day)));
                        count(c, counts);
                    }
                }
            }
        }
        batch("insert into mf_sellout_weekly (week_start, gtin, level, uf, region, city_code, city, neighborhood, published, "
            + "suppress_reason, stores, universe, units, revenue, promo_units, min_price, avg_price, max_price) values (:p, :gtin, :level, "
            + ":uf, :region, :cc, :city, :nb, :pub, :reason, :stores, :universe, :units, :revenue, :promo, :mn, :avg, :mx)", weekly);
        batch("insert into mf_sellout_daily (day, gtin, level, uf, region, city_code, city, neighborhood, published, "
            + "suppress_reason, stores, universe, units, revenue, promo_units, min_price, avg_price, max_price) values (:p, :gtin, :level, "
            + ":uf, :region, :cc, :city, :nb, :pub, :reason, :stores, :universe, :units, :revenue, :promo, :mn, :avg, :mx)", daily);

        if (hourlyFrom != null && policy.hourlyEnabled()) {
            for (LocalDate day = ws; day.isBefore(we); day = day.plusDays(1)) {
                if (!day.isBefore(hourlyFrom) && !day.isAfter(LocalDate.now())) {
                    hourly.addAll(hourlyCells(day, (int) (day.toEpochDay() - ws.toEpochDay()), tracked, locations, dayCellsByGtin, policy, counts));
                }
            }
            batch("insert into mf_sellout_hourly (hour, gtin, level, uf, region, city_code, city, published, suppress_reason, stores, "
                + "units, revenue) values (:p, :gtin, :level, :uf, :region, :cc, :city, :pub, :reason, :stores, :units, :revenue)", hourly);
        }

        rupture(ws, tracked, locations, weekByGtin, policy);
        categoryShare(ws, rows, locations, catBrand, policy);
        return locations.size();
    }

    // ── Células e regras de anonimato ─────────────────────────────────────

    /** Monta UF, cidade e bairro (e o "sem bairro" virtual) a partir da soma por loja. */
    Map<GeoKey, Cell> cells(Map<UUID, Agg> perStore, Map<UUID, Loc> locations, PrivacyPolicyService.Policy policy, boolean withNeighborhood) {
        Map<GeoKey, Cell> out = new LinkedHashMap<>();
        for (Map.Entry<UUID, Agg> s : perStore.entrySet()) {
            Loc l = locations.get(s.getKey());
            if (l == null || s.getValue().units <= 0) {
                continue;
            }
            List<GeoKey> keys = new ArrayList<>(3);
            keys.add(new GeoKey(UF, l.uf(), "*", "*"));
            keys.add(new GeoKey(CIDADE, l.uf(), l.cityCode(), "*"));
            if (withNeighborhood) {
                keys.add(l.nb().isEmpty() ? new GeoKey(SEM_BAIRRO, l.uf(), l.cityCode(), "")
                    : new GeoKey(BAIRRO, l.uf(), l.cityCode(), l.nb()));
            }
            for (GeoKey k : keys) {
                out.computeIfAbsent(k, kk -> new Cell(kk, UF.equals(kk.level()) ? null : l.city()))
                    .stores.computeIfAbsent(s.getKey(), m -> new Agg()).add(s.getValue());
            }
        }
        for (Cell c : out.values()) {
            primary(c, policy);
            if (BAIRRO.equals(c.key.level()) && !policy.neighborhoodEnabled()) {
                c.hide(DESLIGADO);
            }
        }
        return out;
    }

    static void primary(Cell c, PrivacyPolicyService.Policy policy) {
        if (c.virtual()) {
            c.published = false;
            c.reason = POUCAS_LOJAS;
            return;
        }
        double units = c.units();
        double max = 0;
        for (Agg a : c.stores.values()) {
            max = Math.max(max, a.units);
        }
        if (c.stores.size() < policy.minStoresPerCell() || units <= 0) {
            c.published = false;
            c.reason = POUCAS_LOJAS;
        } else if (max > policy.share() * units) {
            c.published = false;
            c.reason = DOMINANCIA;
        } else {
            c.published = true;
            c.reason = null;
        }
    }

    /**
     * Supressão secundária no espaço, de cima para baixo: UF → cidades, depois
     * cidade → bairros. Pai oculto por proteção oculta os filhos.
     */
    static void protectGeo(Map<GeoKey, Cell> cells, PrivacyPolicyService.Policy policy) {
        if (!policy.secondarySuppression()) {
            return;
        }
        Map<GeoKey, List<Cell>> children = new HashMap<>();
        for (Cell c : cells.values()) {
            GeoKey p = c.key.parent();
            if (p != null) {
                children.computeIfAbsent(p, k -> new ArrayList<>()).add(c);
            }
        }
        for (String level : List.of(UF, CIDADE)) {
            for (Cell parent : cells.values()) {
                if (!level.equals(parent.key.level())) {
                    continue;
                }
                List<Cell> kids = children.getOrDefault(parent.key, List.of());
                if (!parent.published) {
                    if (protectiveReason(parent.reason)) {
                        kids.forEach(k -> k.hide(PAI_OCULTO));
                    }
                    continue;
                }
                protectResidual(kids, policy, SECUNDARIA);
            }
        }
    }

    /**
     * Garante que "pai menos os filhos publicados" também passe nas regras.
     * Oculta, um a um, o filho publicado com menos lojas até o resto ficar
     * seguro (ou não sobrar filho publicado: aí o resto é o próprio pai).
     */
    static boolean protectResidual(List<Cell> kids, PrivacyPolicyService.Policy policy, String why) {
        boolean changed = false;
        while (true) {
            Map<UUID, Agg> residual = new HashMap<>();
            for (Cell k : kids) {
                if (!k.published) {
                    for (Map.Entry<UUID, Agg> s : k.stores.entrySet()) {
                        residual.computeIfAbsent(s.getKey(), m -> new Agg()).add(s.getValue());
                    }
                }
            }
            if (residual.isEmpty() || safe(residual, policy)) {
                return changed;
            }
            Cell victim = kids.stream().filter(k -> k.published)
                .min(Comparator.comparingInt((Cell k) -> k.stores.size()).thenComparingDouble(Cell::units)).orElse(null);
            if (victim == null) {
                return changed;
            }
            victim.hide(why);
            changed = true;
        }
    }

    static boolean safe(Map<UUID, Agg> stores, PrivacyPolicyService.Policy policy) {
        double units = 0;
        double max = 0;
        for (Agg a : stores.values()) {
            units += a.units;
            max = Math.max(max, a.units);
        }
        return stores.size() >= policy.minStoresPerCell() && units > 0 && max <= policy.share() * units;
    }

    static boolean protectiveReason(String reason) {
        return SECUNDARIA.equals(reason) || TEMPORAL.equals(reason) || PAI_OCULTO.equals(reason);
    }

    /**
     * Supressão secundária no tempo: para cada lugar, o período maior menos os
     * períodos menores publicados precisa passar nas regras. Alterna com a
     * proteção no espaço até nada mudar (cada passo só oculta, então termina).
     */
    static void protectTime(Map<GeoKey, Cell> outer, Collection<Map<GeoKey, Cell>> inner, PrivacyPolicyService.Policy policy) {
        for (int round = 0; round < 8; round++) {
            boolean changed = false;
            for (Map.Entry<GeoKey, Cell> o : outer.entrySet()) {
                if (o.getValue().virtual()) {
                    continue;
                }
                List<Cell> parts = new ArrayList<>();
                for (Map<GeoKey, Cell> slot : inner) {
                    Cell c = slot.get(o.getKey());
                    if (c != null) {
                        parts.add(c);
                    }
                }
                if (!o.getValue().published) {
                    for (Cell c : parts) {
                        if (c.published) {
                            c.hide(TEMPORAL);
                            changed = true;
                        }
                    }
                    continue;
                }
                if (policy.secondarySuppression()) {
                    changed |= protectResidual(parts, policy, TEMPORAL);
                }
            }
            if (!changed) {
                return;
            }
            for (Map<GeoKey, Cell> slot : inner) {
                protectGeo(slot, policy);
            }
        }
        // Não estabilizou: oculta tudo o que é menor que o período maior.
        for (Map<GeoKey, Cell> slot : inner) {
            slot.values().forEach(c -> c.hide(TEMPORAL));
        }
    }

    // ── Horas ─────────────────────────────────────────────────────────────

    private List<SqlParameterSource> hourlyCells(LocalDate day, int dayIndex, Set<String> tracked, Map<UUID, Loc> locations,
                                                 Map<String, Map<Integer, Map<GeoKey, Cell>>> dayCellsByGtin,
                                                 PrivacyPolicyService.Policy policy, int[] counts) {
        MapSqlParameterSource p = new MapSqlParameterSource()
            .addValue("from", Timestamp.valueOf(day.atStartOfDay())).addValue("to", Timestamp.valueOf(day.plusDays(1).atStartOfDay()))
            .addValue("gtins", tracked);
        Map<String, Map<Integer, Map<UUID, Agg>>> byGtin = new HashMap<>();
        jdbc.query(storeRowsSql("cast(extract(hour from i.data_emissao) as int)"), p, rs -> {
            Row r = row(rs);
            if (locations.containsKey(r.market())) {
                byGtin.computeIfAbsent(r.gtin(), g -> new HashMap<>()).computeIfAbsent(r.slot(), h -> new HashMap<>())
                    .computeIfAbsent(r.market(), m -> new Agg()).add(r.units(), r.revenue(), r.promo(), r.mn(), r.mx());
            }
        });
        List<SqlParameterSource> out = new ArrayList<>();
        for (Map.Entry<String, Map<Integer, Map<UUID, Agg>>> g : byGtin.entrySet()) {
            // O "período maior" é o dia já gravado, com todas as proteções aplicadas.
            Map<GeoKey, Cell> dayCells = dayCellsByGtin.getOrDefault(g.getKey(), Map.of()).get(dayIndex);
            if (dayCells == null) {
                continue;
            }
            Map<Integer, Map<GeoKey, Cell>> hours = new LinkedHashMap<>();
            for (Map.Entry<Integer, Map<UUID, Agg>> h : g.getValue().entrySet()) {
                Map<GeoKey, Cell> hc = cells(h.getValue(), locations, policy, false);
                protectGeo(hc, policy);
                hours.put(h.getKey(), hc);
            }
            protectTime(dayCells, hours.values(), policy);
            for (Map.Entry<Integer, Map<GeoKey, Cell>> h : hours.entrySet()) {
                for (Cell c : h.getValue().values()) {
                    out.add(cellParams(c, g.getKey(), Map.of()).addValue("p", Timestamp.valueOf(day.atTime(h.getKey(), 0))));
                    count(c, counts);
                }
            }
        }
        return out;
    }

    // ── Ruptura e categoria ───────────────────────────────────────────────

    private void rupture(LocalDate ws, Set<String> tracked, Map<UUID, Loc> locations, Map<String, Map<UUID, Agg>> weekByGtin,
                         PrivacyPolicyService.Policy policy) {
        MapSqlParameterSource p = new MapSqlParameterSource()
            .addValue("from", Timestamp.valueOf(ws.minusWeeks(4).atStartOfDay())).addValue("to", Timestamp.valueOf(ws.atStartOfDay()))
            .addValue("gtins", tracked);
        Map<String, Set<UUID>> before = new HashMap<>();
        jdbc.query("select distinct i.market_id, " + String.format(CANON, "it.codigo_ean") + " as gtin from invoices i "
            + "join invoice_items it on it.invoice_id = i.id where i.data_emissao >= :from and i.data_emissao < :to "
            + "and it.quantidade > 0 and " + String.format(CANON, "it.codigo_ean") + " in (:gtins)", p,
            rs -> {
                UUID m = (UUID) rs.getObject(1);
                if (locations.containsKey(m)) {
                    before.computeIfAbsent(rs.getString(2), g -> new HashSet<>()).add(m);
                }
            });
        List<SqlParameterSource> out = new ArrayList<>();
        for (Map.Entry<String, Set<UUID>> e : before.entrySet()) {
            Set<UUID> now = weekByGtin.getOrDefault(e.getKey(), Map.of()).keySet();
            Map<GeoKey, int[]> agg = new LinkedHashMap<>();
            Map<GeoKey, String> cityName = new HashMap<>();
            for (UUID m : e.getValue()) {
                Loc l = locations.get(m);
                for (GeoKey k : List.of(new GeoKey(UF, l.uf(), "*", "*"), new GeoKey(CIDADE, l.uf(), l.cityCode(), "*"))) {
                    int[] v = agg.computeIfAbsent(k, kk -> new int[2]);
                    v[0]++;
                    if (now.contains(m)) {
                        v[1]++;
                    }
                    if (CIDADE.equals(k.level())) {
                        cityName.put(k, l.city());
                    }
                }
            }
            for (Map.Entry<GeoKey, int[]> a : agg.entrySet()) {
                GeoKey k = a.getKey();
                out.add(new MapSqlParameterSource().addValue("p", Date.valueOf(ws)).addValue("gtin", e.getKey())
                    .addValue("level", k.level()).addValue("uf", k.uf()).addValue("region", region(k.uf()))
                    .addValue("cc", k.cityCode()).addValue("city", cityName.get(k))
                    .addValue("pub", a.getValue()[0] >= policy.minStoresPerCell())
                    .addValue("b", a.getValue()[0]).addValue("n", a.getValue()[1]).addValue("s", a.getValue()[0] - a.getValue()[1]));
            }
        }
        batch("insert into mf_rupture_weekly (week_start, gtin, level, uf, region, city_code, city, published, stores_before, "
            + "stores_now, stores_stopped) values (:p, :gtin, :level, :uf, :region, :cc, :city, :pub, :b, :n, :s)", out);
    }

    /**
     * Participação de cada GTIN na sua categoria, por cidade e UF. Publicada só
     * com lojas suficientes, marcas suficientes e nenhuma marca dominante: assim
     * "100% menos a minha parte" nunca vira a venda de um concorrente.
     */
    private void categoryShare(LocalDate ws, List<Row> rows, Map<UUID, Loc> locations, Map<String, String[]> catBrand,
                               PrivacyPolicyService.Policy policy) {
        if (catBrand.isEmpty()) {
            return;
        }
        Set<String> categories = new HashSet<>();
        catBrand.values().forEach(cb -> categories.add(cb[0]));
        // Toda a categoria entra no denominador, não só os GTINs acompanhados.
        Map<String, Map<GeoKey, Map<String, Double>>> brandUnits = new HashMap<>();
        Map<String, Map<GeoKey, Set<UUID>>> catStores = new HashMap<>();
        Map<String, Map<GeoKey, Map<UUID, Double>>> catStoreUnits = new HashMap<>();
        Map<String, Map<GeoKey, Double>> gtinUnits = new HashMap<>();
        Map<GeoKey, String> cityName = new HashMap<>();
        MapSqlParameterSource p = new MapSqlParameterSource()
            .addValue("from", Timestamp.valueOf(ws.atStartOfDay())).addValue("to", Timestamp.valueOf(ws.plusWeeks(1).atStartOfDay()))
            .addValue("cats", categories);
        jdbc.query("select i.market_id, " + String.format(CANON, "it.codigo_ean") + " as gtin, pr.category, pr.brand, sum(it.quantidade) as units "
            + "from invoices i join invoice_items it on it.invoice_id = i.id join products pr on pr.id = it.product_id "
            + "where i.data_emissao >= :from and i.data_emissao < :to and it.quantidade > 0 and trim(pr.category) in (:cats) "
            + "and it.codigo_ean ~ '^[0-9]{8,14}$' group by 1, 2, 3, 4", p, rs -> {
                UUID m = (UUID) rs.getObject("market_id");
                Loc l = locations.get(m);
                if (l == null) {
                    return;
                }
                String gtin = rs.getString("gtin");
                String cat = rs.getString("category").trim();
                String brand = brandOf(gtin, rs.getString("brand"));
                double u = rs.getDouble("units");
                for (GeoKey k : List.of(new GeoKey(UF, l.uf(), "*", "*"), new GeoKey(CIDADE, l.uf(), l.cityCode(), "*"))) {
                    brandUnits.computeIfAbsent(cat, c -> new HashMap<>()).computeIfAbsent(k, kk -> new HashMap<>()).merge(brand, u, Double::sum);
                    catStores.computeIfAbsent(cat, c -> new HashMap<>()).computeIfAbsent(k, kk -> new HashSet<>()).add(m);
                    catStoreUnits.computeIfAbsent(cat, c -> new HashMap<>()).computeIfAbsent(k, kk -> new HashMap<>()).merge(m, u, Double::sum);
                    if (catBrand.containsKey(gtin)) {
                        gtinUnits.computeIfAbsent(gtin, g -> new HashMap<>()).merge(k, u, Double::sum);
                    }
                    if (CIDADE.equals(k.level())) {
                        cityName.put(k, l.city());
                    }
                }
            });
        List<SqlParameterSource> out = new ArrayList<>();
        for (Map.Entry<String, Map<GeoKey, Double>> g : gtinUnits.entrySet()) {
            String cat = catBrand.get(g.getKey())[0];
            for (Map.Entry<GeoKey, Double> e : g.getValue().entrySet()) {
                GeoKey k = e.getKey();
                Map<String, Double> brands = brandUnits.get(cat).get(k);
                double total = brands.values().stream().mapToDouble(Double::doubleValue).sum();
                double topBrand = brands.values().stream().mapToDouble(Double::doubleValue).max().orElse(0);
                double topStore = catStoreUnits.get(cat).get(k).values().stream().mapToDouble(Double::doubleValue).max().orElse(0);
                int stores = catStores.get(cat).get(k).size();
                String reason = null;
                if (stores < policy.minStoresPerCell()) {
                    reason = POUCAS_LOJAS;
                } else if (topStore > policy.share() * total) {
                    reason = DOMINANCIA;
                } else if (brands.size() < policy.categoryMinBrands()) {
                    reason = "POUCAS_MARCAS";
                } else if (topBrand > policy.categoryMaxBrandShare().doubleValue() * total) {
                    reason = "MARCA_DOMINANTE";
                }
                out.add(new MapSqlParameterSource().addValue("p", Date.valueOf(ws)).addValue("gtin", g.getKey())
                    .addValue("cat", cut(cat, 120)).addValue("level", k.level()).addValue("uf", k.uf()).addValue("region", region(k.uf()))
                    .addValue("cc", k.cityCode()).addValue("city", cityName.get(k)).addValue("pub", reason == null)
                    .addValue("reason", reason).addValue("brands", brands.size())
                    .addValue("share", reason == null && total > 0 ? round(e.getValue() * 100.0 / total, 3) : null));
            }
        }
        batch("insert into mf_category_share_weekly (week_start, gtin, category, level, uf, region, city_code, city, published, "
            + "suppress_reason, brands, share_pct) values (:p, :gtin, :cat, :level, :uf, :region, :cc, :city, :pub, :reason, :brands, :share)", out);
    }

    // ── Cobertura ─────────────────────────────────────────────────────────

    private void rebuildCoverage(PrivacyPolicyService.Policy policy) {
        Map<UUID, Loc> locations = participatingLocations(LocalDate.now().minusDays(30), LocalDate.now().plusDays(1));
        Map<GeoKey, Integer> universe = universe(locations.values());
        Map<GeoKey, String> names = new HashMap<>();
        locations.values().forEach(l -> names.put(new GeoKey(CIDADE, l.uf(), l.cityCode(), "*"), l.city()));
        jdbc.update("delete from mf_coverage", Map.of());
        List<SqlParameterSource> out = new ArrayList<>();
        for (Map.Entry<GeoKey, Integer> u : universe.entrySet()) {
            GeoKey k = u.getKey();
            if (BAIRRO.equals(k.level())) {
                continue;
            }
            out.add(new MapSqlParameterSource().addValue("level", k.level()).addValue("uf", k.uf()).addValue("region", region(k.uf()))
                .addValue("cc", k.cityCode()).addValue("city", names.get(k)).addValue("pub", u.getValue() >= policy.minStoresPerCell())
                .addValue("stores", u.getValue()));
        }
        batch("insert into mf_coverage (level, uf, region, city_code, city, published, stores) "
            + "values (:level, :uf, :region, :cc, :city, :pub, :stores)", out);
    }

    // ── Leitura ───────────────────────────────────────────────────────────

    /** Linhas por loja e GTIN; {@code slotExpr} define o período (dia da semana ou hora). */
    private static String storeRowsSql(String slotExpr) {
        String canon = String.format(CANON, "it.codigo_ean");
        return "select i.market_id, " + canon + " as gtin, " + slotExpr + " as slot, "
            + "sum(it.quantidade) as units, sum(coalesce(it.valor_liquido, it.valor_total, 0)) as revenue, "
            + "sum(case when coalesce(it.valor_desconto, 0) > 0 then it.quantidade else 0 end) as promo, "
            + "min(it.valor_unitario) as mn, max(it.valor_unitario) as mx, max(pr.category) as category, max(pr.brand) as brand "
            + "from invoices i join invoice_items it on it.invoice_id = i.id left join products pr on pr.id = it.product_id "
            + "where i.data_emissao >= :from and i.data_emissao < :to and it.quantidade > 0 "
            // GTIN de circulação restrita (prefixo 2: peso variável, código da loja) identificaria a loja.
            + "and it.codigo_ean ~ '^([0-9]{8}|[0-9]{12,14})$' and ltrim(it.codigo_ean, '0') !~ '^2' "
            + "and " + canon + " in (:gtins) "
            + "group by 1, 2, 3";
    }

    private static Row row(ResultSet rs) throws SQLException {
        return new Row((UUID) rs.getObject("market_id"), rs.getString("gtin"), rs.getInt("slot"), rs.getDouble("units"),
            rs.getDouble("revenue"), rs.getDouble("promo"), rs.getDouble("mn"), rs.getDouble("mx"),
            rs.getString("category"), rs.getString("brand"));
    }

    /**
     * Lojas que entram: ativas, com endereço, com venda no período e que não
     * saíram (só plano pago pode sair; Grátis participa sempre).
     */
    Map<UUID, Loc> participatingLocations(LocalDate from, LocalDate to) {
        Map<UUID, Loc> out = new HashMap<>();
        jdbc.query("select l.market_id, l.uf, l.city_code, l.city, coalesce(upper(trim(l.neighborhood)), '') as nb "
            + "from market_locations l join markets m on m.id = l.market_id "
            + "left join market_data_participation dp on dp.market_id = l.market_id "
            + "where coalesce(m.is_active, true) and l.uf is not null and l.city_code is not null "
            + "and (dp.status is null or dp.status = 'PARTICIPA' or coalesce(m.plan_type, 'FREE') = 'FREE') "
            + "and exists (select 1 from invoices i where i.market_id = l.market_id and i.data_emissao >= :a and i.data_emissao < :b)",
            new MapSqlParameterSource().addValue("a", Timestamp.valueOf(from.atStartOfDay())).addValue("b", Timestamp.valueOf(to.atStartOfDay())),
            rs -> {
                out.put((UUID) rs.getObject("market_id"), new Loc(rs.getString("uf").toUpperCase(java.util.Locale.ROOT),
                    rs.getString("city_code"), upper(rs.getString("city")), rs.getString("nb").replaceAll("\\s+", " ")));
            });
        return out;
    }

    static Map<GeoKey, Integer> universe(Collection<Loc> locations) {
        Map<GeoKey, Integer> out = new HashMap<>();
        for (Loc l : locations) {
            out.merge(new GeoKey(UF, l.uf(), "*", "*"), 1, Integer::sum);
            out.merge(new GeoKey(CIDADE, l.uf(), l.cityCode(), "*"), 1, Integer::sum);
            if (!l.nb().isEmpty()) {
                out.merge(new GeoKey(BAIRRO, l.uf(), l.cityCode(), l.nb()), 1, Integer::sum);
            }
        }
        return out;
    }

    private Set<String> trackedGtins(Collection<String> only) {
        List<String> all = jdbc.queryForList("select distinct gtin from industry_portfolio where status in ('PEDIDO', 'APROVADO')",
            Map.of(), String.class);
        Set<String> out = new HashSet<>(all);
        if (only != null) {
            out.retainAll(new HashSet<>(only));
        }
        return out;
    }

    /** Apaga o que será refeito. Horas só a partir de {@code hourlyFrom}: as mais antigas da semana ficam. */
    private void deleteWeek(LocalDate ws, LocalDate we, Set<String> tracked, LocalDate hourlyFrom) {
        LocalDate hf = hourlyFrom == null ? null : hourlyFrom.isAfter(ws) ? hourlyFrom : ws;
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("ws", Date.valueOf(ws)).addValue("we", Date.valueOf(we))
            .addValue("gtins", tracked.isEmpty() ? List.of("-") : tracked);
        jdbc.update("delete from mf_sellout_weekly where week_start = :ws and gtin in (:gtins)", p);
        jdbc.update("delete from mf_sellout_daily where day >= :ws and day < :we and gtin in (:gtins)", p);
        if (hf != null && hf.isBefore(we)) {
            p.addValue("hf", Timestamp.valueOf(hf.atStartOfDay())).addValue("ht", Timestamp.valueOf(we.atStartOfDay()));
            jdbc.update("delete from mf_sellout_hourly where hour >= :hf and hour < :ht and gtin in (:gtins)", p);
        }
        jdbc.update("delete from mf_rupture_weekly where week_start = :ws and gtin in (:gtins)", p);
        jdbc.update("delete from mf_category_share_weekly where week_start = :ws and gtin in (:gtins)", p);
    }

    private MapSqlParameterSource cellParams(Cell c, String gtin, Map<GeoKey, Integer> universe) {
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("gtin", gtin).addValue("level", c.key.level())
            .addValue("uf", c.key.uf()).addValue("region", region(c.key.uf())).addValue("cc", c.key.cityCode())
            .addValue("city", c.city).addValue("nb", c.key.nb()).addValue("pub", c.published).addValue("reason", c.reason)
            .addValue("stores", c.stores.size()).addValue("universe", universe.get(c.key));
        if (c.published) {
            Agg t = new Agg();
            c.stores.values().forEach(t::add);
            p.addValue("units", round(t.units, 3)).addValue("revenue", round(t.revenue, 2)).addValue("promo", round(t.promo, 3))
                .addValue("mn", round(t.mn, 4)).addValue("mx", round(t.mx, 4))
                .addValue("avg", t.units > 0 ? round(t.revenue / t.units, 4) : null);
        } else {
            p.addValue("units", null).addValue("revenue", null).addValue("promo", null)
                .addValue("mn", null).addValue("mx", null).addValue("avg", null);
        }
        return p;
    }

    private static void count(Cell c, int[] counts) {
        counts[c.published ? 0 : 1]++;
    }

    private void batch(String sql, List<SqlParameterSource> rows) {
        for (int i = 0; i < rows.size(); i += 1000) {
            jdbc.batchUpdate(sql, rows.subList(i, Math.min(rows.size(), i + 1000)).toArray(new SqlParameterSource[0]));
        }
    }

    /** Marca do catálogo; sem marca, o prefixo da empresa no GTIN faz as vezes. */
    static String brandOf(String gtin, String brand) {
        if (brand != null && !brand.isBlank()) {
            return brand.trim().toUpperCase(java.util.Locale.ROOT);
        }
        return "GS1:" + (gtin.length() >= 8 ? gtin.substring(0, 8) : gtin);
    }

    static String region(String uf) {
        return switch (uf == null ? "" : uf) {
            case "AC", "AM", "AP", "PA", "RO", "RR", "TO" -> "NORTE";
            case "AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE" -> "NORDESTE";
            case "DF", "GO", "MS", "MT" -> "CENTRO-OESTE";
            case "ES", "MG", "RJ", "SP" -> "SUDESTE";
            default -> "SUL";
        };
    }

    static Double round(double v, int scale) {
        if (Double.isNaN(v) || Double.isInfinite(v) || v == Double.MAX_VALUE || v == -Double.MAX_VALUE) {
            return null;
        }
        return java.math.BigDecimal.valueOf(v).setScale(scale, java.math.RoundingMode.HALF_UP).doubleValue();
    }

    /** Nome de cidade igual venha de onde vier (NFC-e, Confere, Receita, manual). */
    static String upper(String s) {
        return s == null ? null : s.trim().replaceAll("\\s+", " ").toUpperCase(java.util.Locale.ROOT);
    }

    static String cut(String s, int max) {
        return s == null ? null : s.length() > max ? s.substring(0, max) : s;
    }

    /** GTIN canônico em Java, igual ao {@link #CANON} do SQL. */
    public static String canonical(String raw) {
        if (raw == null) {
            return null;
        }
        String d = raw.replaceAll("\\D", "");
        if (!d.matches("[0-9]{8}|[0-9]{12,14}")) {
            return null;
        }
        String t = d.replaceFirst("^0+", "");
        if (t.isEmpty()) {
            return null;
        }
        return t.length() <= 13 ? "0".repeat(13 - t.length()) + t : t;
    }
}
