package com.pdv2cloud.service.intelligence;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Quais dias têm o histórico de notas completo.
 *
 * Auditoria de 06/10/2026: o agente ainda enviava ~37 mil notas atrasadas e os
 * meses de jan–jul/2026 tinham 1/7 das notas no servidor. Toda comparação entre
 * períodos (tendência, momento, sazonalidade, efeito de promoção) lia o buraco
 * como queda de venda — a loja inteira aparecia +361%.
 *
 * Regra (validada nos dados do Super Novo): um dia é completo quando tem pelo
 * menos 25% das notas do percentil 75 do MESMO dia da semana nos últimos 400
 * dias. Separa limpo os dias cheios (~150 notas) dos meses parciais (~22).
 * O dia de hoje nunca é completo: ainda está acontecendo.
 */
@Service
public class DataCompletenessService {

    static final double MIN_SHARE_OF_P75 = 0.25;
    static final int LOOKBACK_DAYS = 400;
    static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
    private static final Duration CACHE_TTL = Duration.ofMinutes(10);

    private final NamedParameterJdbcTemplate jdbc;
    private final Map<UUID, Cached> cache = new ConcurrentHashMap<>();

    public DataCompletenessService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Gap(LocalDate from, LocalDate to, long days) { }

    public record Coverage(
        Set<LocalDate> completeDays,
        Map<LocalDate, Long> invoicesPerDay,
        LocalDate today
    ) {
        public boolean isComplete(LocalDate day) {
            return completeDays.contains(day);
        }

        /** Dias completos no intervalo [from, to) dividido pelos dias do calendário. */
        public double share(LocalDate from, LocalDate toExclusive) {
            long total = Math.max(0, ChronoUnit.DAYS.between(from, toExclusive));
            if (total == 0) return 0;
            long ok = completeDays.stream().filter(d -> !d.isBefore(from) && d.isBefore(toExclusive)).count();
            return (double) ok / total;
        }

        public List<LocalDate> completeBetween(LocalDate from, LocalDate toExclusive) {
            List<LocalDate> out = new ArrayList<>();
            for (LocalDate d : completeDays) {
                if (!d.isBefore(from) && d.isBefore(toExclusive)) out.add(d);
            }
            return out;
        }

        /** Trechos de 3+ dias seguidos sem histórico completo, dentro do intervalo. */
        public List<Gap> gaps(LocalDate from, LocalDate toExclusive) {
            List<Gap> out = new ArrayList<>();
            LocalDate start = null;
            for (LocalDate d = from; d.isBefore(toExclusive); d = d.plusDays(1)) {
                if (!completeDays.contains(d)) {
                    if (start == null) start = d;
                } else if (start != null) {
                    addGap(out, start, d.minusDays(1));
                    start = null;
                }
            }
            if (start != null) addGap(out, start, toExclusive.minusDays(1));
            return out;
        }

        private static void addGap(List<Gap> out, LocalDate a, LocalDate b) {
            long days = ChronoUnit.DAYS.between(a, b) + 1;
            if (days >= 3) out.add(new Gap(a, b, days));
        }
    }

    private record Cached(Coverage coverage, Instant at) { }

    public Coverage coverage(UUID marketId) {
        Cached c = cache.get(marketId);
        if (c != null && c.at().plus(CACHE_TTL).isAfter(Instant.now())) {
            return c.coverage();
        }
        LocalDate today = LocalDate.now(ZONE);
        Map<LocalDate, Long> perDay = new TreeMap<>();
        jdbc.query(
            "select cast(data_emissao as date) as d, count(*) as n from invoices "
                + "where market_id = :m and data_emissao >= :since group by 1",
            new MapSqlParameterSource("m", marketId).addValue("since", today.minusDays(LOOKBACK_DAYS).atStartOfDay()),
            rs -> { perDay.put(rs.getDate("d").toLocalDate(), rs.getLong("n")); });
        Coverage coverage = classify(perDay, today);
        cache.put(marketId, new Cached(coverage, Instant.now()));
        return coverage;
    }

    /** Regra pura, testável: p75 por dia da semana, corte de 25%, hoje fora. */
    static Coverage classify(Map<LocalDate, Long> perDay, LocalDate today) {
        Map<Integer, List<Long>> byDow = new HashMap<>();
        perDay.forEach((d, n) -> {
            if (n > 0 && d.isBefore(today)) byDow.computeIfAbsent(d.getDayOfWeek().getValue(), k -> new ArrayList<>()).add(n);
        });
        List<Long> all = new ArrayList<>();
        byDow.values().forEach(all::addAll);
        double overall = p75(all);
        Map<Integer, Double> ref = new HashMap<>();
        byDow.forEach((dow, list) -> ref.put(dow, list.size() >= 3 ? p75(list) : overall));

        Set<LocalDate> complete = new TreeSet<>();
        perDay.forEach((d, n) -> {
            if (!d.isBefore(today)) return;
            double r = ref.getOrDefault(d.getDayOfWeek().getValue(), overall);
            if (r > 0 && n >= MIN_SHARE_OF_P75 * r) complete.add(d);
        });
        return new Coverage(Collections.unmodifiableSet(complete), Collections.unmodifiableMap(perDay), today);
    }

    static double p75(List<Long> values) {
        if (values.isEmpty()) return 0;
        long[] v = values.stream().mapToLong(Long::longValue).toArray();
        Arrays.sort(v);
        double pos = 0.75 * (v.length - 1);
        int lo = (int) Math.floor(pos);
        int hi = (int) Math.ceil(pos);
        return v[lo] + (v[hi] - v[lo]) * (pos - lo);
    }

    public void invalidate(UUID marketId) {
        cache.remove(marketId);
    }
}
