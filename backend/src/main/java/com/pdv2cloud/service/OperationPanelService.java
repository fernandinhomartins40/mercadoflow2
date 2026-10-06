package com.pdv2cloud.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Os números da operação no Início: vendas, clientes (cupons), ticket médio e
 * itens por compra, sempre comparados com o mesmo trecho uma semana antes
 * (terça com terça, até a mesma hora), mais as vendas por hora ou por dia, os
 * departamentos, os produtos que mais mudaram e a margem estimada.
 *
 * Quando a loja ainda não tem venda hoje (agente parado ou notas atrasadas),
 * o painel usa o último dia com venda e diz isso, em vez de mostrar zero.
 *
 * Os itens das notas são lidos UMA vez (as duas janelas juntas): sob RLS, cada
 * item confere a nota dona, então cada varredura extra custa caro.
 */
@Service
public class OperationPanelService {

    static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
    /** A margem só aparece quando o custo cobre esta fatia do que se vendeu. */
    static final double MIN_COST_COVERAGE = 0.6;
    private static final String OTHERS = "Outros";

    /** Fatia mínima de dias completos no período anterior para mostrar variação. */
    static final double MIN_PREVIOUS_COMPLETE = 0.9;

    private final NamedParameterJdbcTemplate jdbc;
    private final com.pdv2cloud.service.intelligence.DataCompletenessService completeness;

    public OperationPanelService(NamedParameterJdbcTemplate jdbc,
                                 com.pdv2cloud.service.intelligence.DataCompletenessService completeness) {
        this.jdbc = jdbc;
        this.completeness = completeness;
    }

    public enum Period { DIA, SEMANA, MES;
        static Period of(String raw) {
            if (raw == null) return DIA;
            return switch (raw.trim().toLowerCase(Locale.ROOT)) {
                case "semana", "week" -> SEMANA;
                case "mes", "mês", "month" -> MES;
                default -> DIA;
            };
        }
    }

    public record Window(LocalDateTime start, LocalDateTime end, LocalDateTime prevStart, LocalDateTime prevEnd) { }

    public record Metric(String key, BigDecimal value, BigDecimal previous, Double change) { }

    public record SeriesPoint(String label, BigDecimal current, BigDecimal reference) { }

    public record Department(String name, BigDecimal revenue, BigDecimal previous, Double change, double share) { }

    public record ProductMove(UUID productId, String name, String imageUrl, BigDecimal revenue, BigDecimal previous, Double change) { }

    public record Margin(Double percent, double coverage) { }

    public record Panel(
        String period,
        boolean today,
        LocalDate referenceDate,
        LocalDateTime lastSaleAt,
        LocalDateTime windowStart,
        LocalDateTime windowEnd,
        String comparisonLabel,
        String seriesReferenceLabel,
        List<Metric> metrics,
        List<SeriesPoint> series,
        List<Department> departments,
        List<ProductMove> topProducts,
        List<ProductMove> rising,
        List<ProductMove> falling,
        Margin margin,
        /** false quando o período de comparação ainda não tem as notas todas. */
        boolean comparable,
        double previousCompleteShare
    ) { }

    /** Uma linha por produto (ou "sem produto"), com as duas janelas. */
    record ItemRow(UUID productId, String name, String imageUrl, String department,
                   BigDecimal cur, BigDecimal prev, BigDecimal curQty, long curLines, long prevLines) { }

    public Panel panel(UUID marketId, String rawPeriod) {
        return panel(marketId, Period.of(rawPeriod), LocalDateTime.now(ZONE));
    }

    Panel panel(UUID marketId, Period period, LocalDateTime now) {
        LocalDateTime lastSale = jdbc.query(
            "select max(data_emissao) from invoices where market_id = :m and data_emissao <= :now",
            new MapSqlParameterSource("m", marketId).addValue("now", Timestamp.valueOf(now.plusHours(1))),
            rs -> rs.next() && rs.getTimestamp(1) != null ? rs.getTimestamp(1).toLocalDateTime() : null);

        boolean today = lastSale != null && lastSale.toLocalDate().equals(now.toLocalDate());
        LocalDate refDate = lastSale == null || today ? now.toLocalDate() : lastSale.toLocalDate();
        LocalDateTime cutoff = today || lastSale == null ? now : refDate.plusDays(1).atStartOfDay();
        Window w = window(period, refDate, cutoff);

        // Período anterior sem histórico completo não serve de base: a variação
        // mostraria a falta de notas, não a loja (auditoria 06/10/2026).
        com.pdv2cloud.service.intelligence.DataCompletenessService.Coverage cov = completeness.coverage(marketId);
        double prevShare = cov.share(w.prevStart().toLocalDate(),
            w.prevEnd().toLocalDate().plusDays(w.prevEnd().toLocalTime().equals(java.time.LocalTime.MIDNIGHT) ? 0 : 1));
        boolean comparable = prevShare >= MIN_PREVIOUS_COMPLETE;

        BigDecimal[] receipts = receipts(marketId, w);
        List<ItemRow> items = items(marketId, w);
        long curLines = items.stream().mapToLong(ItemRow::curLines).sum();
        long prevLines = items.stream().mapToLong(ItemRow::prevLines).sum();

        List<Metric> metrics = List.of(
            metric("vendas", receipts[0], receipts[1], comparable),
            metric("clientes", receipts[2], receipts[3], comparable),
            metric("ticket", ratio(receipts[0], receipts[2], 2), ratio(receipts[1], receipts[3], 2), comparable),
            metric("itens", ratio(BigDecimal.valueOf(curLines), receipts[2], 1), ratio(BigDecimal.valueOf(prevLines), receipts[3], 1), comparable)
        );

        List<SeriesPoint> series = period == Period.DIA ? hourly(marketId, refDate, w) : daily(marketId, w);

        return new Panel(
            period.name().toLowerCase(Locale.ROOT),
            today,
            refDate,
            lastSale,
            w.start(),
            w.end(),
            comparisonLabel(period, refDate, today),
            period == Period.DIA ? "média das últimas 4 " + weekdayPlural(refDate) : "semana anterior",
            metrics,
            series,
            comparable ? departments(items) : departments(items).stream()
                .map(d -> new Department(d.name(), d.revenue(), d.previous(), null, d.share())).toList(),
            topProducts(items),
            comparable ? movers(items, true) : List.of(),
            comparable ? movers(items, false) : List.of(),
            margin(marketId, items),
            comparable,
            prevShare
        );
    }

    /** Janela atual e a de comparação, sempre deslocada em semanas inteiras (o dia da semana importa em mercado). */
    static Window window(Period period, LocalDate refDate, LocalDateTime cutoff) {
        return switch (period) {
            case DIA -> {
                LocalDateTime start = refDate.atStartOfDay();
                yield new Window(start, cutoff, start.minusDays(7), cutoff.minusDays(7));
            }
            case SEMANA -> new Window(cutoff.minusDays(7), cutoff, cutoff.minusDays(14), cutoff.minusDays(7));
            case MES -> new Window(cutoff.minusDays(28), cutoff, cutoff.minusDays(56), cutoff.minusDays(28));
        };
    }

    static Double change(BigDecimal current, BigDecimal previous) {
        if (previous == null || previous.signum() == 0 || current == null) return null;
        return current.subtract(previous).divide(previous, 6, RoundingMode.HALF_UP).doubleValue() * 100.0;
    }

    private static Metric metric(String key, BigDecimal value, BigDecimal previous, boolean comparable) {
        return new Metric(key, value, previous, comparable ? change(value, previous) : null);
    }

    private static BigDecimal ratio(BigDecimal a, BigDecimal b, int scale) {
        return b == null || b.signum() == 0 ? BigDecimal.ZERO : a.divide(b, scale, RoundingMode.HALF_UP);
    }

    private MapSqlParameterSource params(UUID marketId, Window w) {
        return new MapSqlParameterSource("m", marketId)
            .addValue("s", Timestamp.valueOf(w.start()))
            .addValue("e", Timestamp.valueOf(w.end()))
            .addValue("ps", Timestamp.valueOf(w.prevStart()))
            .addValue("pe", Timestamp.valueOf(w.prevEnd()));
    }

    private static final String BOTH_WINDOWS =
        "((i.data_emissao >= :s and i.data_emissao < :e) or (i.data_emissao >= :ps and i.data_emissao < :pe))";

    /** Faturamento e cupons das duas janelas: [vendas, vendas antes, cupons, cupons antes]. */
    private BigDecimal[] receipts(UUID marketId, Window w) {
        return jdbc.query(
            "select coalesce(sum(case when i.data_emissao >= :s then i.valor_total end), 0) as cur, " +
            "  coalesce(sum(case when i.data_emissao < :pe then i.valor_total end), 0) as prev, " +
            "  count(*) filter (where i.data_emissao >= :s) as cur_n, " +
            "  count(*) filter (where i.data_emissao < :pe) as prev_n " +
            "from invoices i where i.market_id = :m and " + BOTH_WINDOWS,
            params(marketId, w),
            rs -> {
                rs.next();
                return new BigDecimal[] {
                    nz(rs.getBigDecimal("cur")), nz(rs.getBigDecimal("prev")),
                    BigDecimal.valueOf(rs.getLong("cur_n")), BigDecimal.valueOf(rs.getLong("prev_n"))
                };
            });
    }

    /** A única leitura dos itens: produto, departamento e as duas janelas. */
    private List<ItemRow> items(UUID marketId, Window w) {
        return jdbc.query(
            "select it.product_id, max(p.name) as name, max(p.image_url) as image_url, " +
            "  coalesce(nullif(trim(max(p.category)), ''), '" + OTHERS + "') as dep, " +
            "  coalesce(sum(case when i.data_emissao >= :s then it.valor_total end), 0) as cur, " +
            "  coalesce(sum(case when i.data_emissao < :pe then it.valor_total end), 0) as prev, " +
            "  coalesce(sum(case when i.data_emissao >= :s then it.quantidade end), 0) as cur_qty, " +
            "  count(*) filter (where i.data_emissao >= :s) as cur_lines, " +
            "  count(*) filter (where i.data_emissao < :pe) as prev_lines " +
            "from invoice_items it join invoices i on i.id = it.invoice_id " +
            "left join products p on p.id = it.product_id " +
            "where i.market_id = :m and " + BOTH_WINDOWS + " group by it.product_id",
            params(marketId, w),
            (rs, n) -> new ItemRow(
                rs.getObject("product_id", UUID.class), rs.getString("name"), rs.getString("image_url"), rs.getString("dep"),
                nz(rs.getBigDecimal("cur")), nz(rs.getBigDecimal("prev")), nz(rs.getBigDecimal("cur_qty")),
                rs.getLong("cur_lines"), rs.getLong("prev_lines")));
    }

    /** Hoje hora a hora contra a média das 4 últimas semanas no mesmo dia da semana (dia inteiro). */
    private List<SeriesPoint> hourly(UUID marketId, LocalDate refDate, Window w) {
        Map<Integer, BigDecimal> cur = new HashMap<>();
        Map<Integer, BigDecimal> ref = new HashMap<>();
        jdbc.query(
            "select cast(extract(hour from data_emissao) as integer) as h, " +
            "  sum(case when data_emissao >= :s then valor_total end) as cur, " +
            "  sum(case when data_emissao < :rs then valor_total end) / 4 as ref " +
            "from invoices where market_id = :m and ((data_emissao >= :s and data_emissao < :e) " +
            "  or (data_emissao >= :r0 and data_emissao < :rs and extract(dow from data_emissao) = :dow)) group by 1",
            new MapSqlParameterSource("m", marketId)
                .addValue("s", Timestamp.valueOf(w.start()))
                .addValue("e", Timestamp.valueOf(w.end()))
                .addValue("r0", Timestamp.valueOf(refDate.minusDays(28).atStartOfDay()))
                .addValue("rs", Timestamp.valueOf(refDate.atStartOfDay()))
                .addValue("dow", refDate.getDayOfWeek().getValue() % 7),
            rs -> {
                int h = rs.getInt("h");
                if (rs.getBigDecimal("cur") != null) cur.put(h, rs.getBigDecimal("cur"));
                if (rs.getBigDecimal("ref") != null) ref.put(h, rs.getBigDecimal("ref").setScale(2, RoundingMode.HALF_UP));
            });

        int first = 24;
        int last = -1;
        for (int h = 0; h < 24; h++) {
            if (cur.containsKey(h) || ref.containsKey(h)) {
                first = Math.min(first, h);
                last = Math.max(last, h);
            }
        }
        List<SeriesPoint> out = new ArrayList<>();
        for (int h = first; h <= last; h++) {
            out.add(new SeriesPoint(h + "h", cur.getOrDefault(h, BigDecimal.ZERO), ref.getOrDefault(h, BigDecimal.ZERO)));
        }
        return out;
    }

    /** Dia a dia da janela contra o mesmo dia da semana anterior. */
    private List<SeriesPoint> daily(UUID marketId, Window w) {
        Map<LocalDate, BigDecimal> byDay = new HashMap<>();
        jdbc.query(
            "select cast(data_emissao as date) as d, sum(valor_total) as v from invoices " +
            "where market_id = :m and data_emissao >= :s and data_emissao < :e group by 1",
            new MapSqlParameterSource("m", marketId)
                .addValue("s", Timestamp.valueOf(w.start().minusDays(7)))
                .addValue("e", Timestamp.valueOf(w.end())),
            rs -> { byDay.put(rs.getDate("d").toLocalDate(), nz(rs.getBigDecimal("v"))); });
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd/MM");
        List<SeriesPoint> out = new ArrayList<>();
        LocalDate last = w.end().minusNanos(1).toLocalDate();
        for (LocalDate d = w.start().toLocalDate(); !d.isAfter(last); d = d.plusDays(1)) {
            out.add(new SeriesPoint(d.format(fmt), byDay.getOrDefault(d, BigDecimal.ZERO), byDay.getOrDefault(d.minusDays(7), BigDecimal.ZERO)));
        }
        return out;
    }

    static List<Department> departments(List<ItemRow> items) {
        Map<String, BigDecimal[]> byDep = new LinkedHashMap<>();
        for (ItemRow r : items) {
            BigDecimal[] acc = byDep.computeIfAbsent(r.department(), k -> new BigDecimal[] { BigDecimal.ZERO, BigDecimal.ZERO });
            acc[0] = acc[0].add(r.cur());
            acc[1] = acc[1].add(r.prev());
        }
        BigDecimal total = byDep.values().stream().map(a -> a[0]).reduce(BigDecimal.ZERO, BigDecimal::add);
        return byDep.entrySet().stream()
            .sorted(Comparator.comparing((Map.Entry<String, BigDecimal[]> e) -> e.getValue()[0]).reversed())
            .limit(8)
            .map(e -> new Department(e.getKey(), e.getValue()[0], e.getValue()[1], change(e.getValue()[0], e.getValue()[1]),
                total.signum() == 0 ? 0 : e.getValue()[0].divide(total, 6, RoundingMode.HALF_UP).doubleValue()))
            .toList();
    }

    private static ProductMove move(ItemRow r) {
        return new ProductMove(r.productId(), r.name(), r.imageUrl(), r.cur(), r.prev(), change(r.cur(), r.prev()));
    }

    static List<ProductMove> topProducts(List<ItemRow> items) {
        return items.stream()
            .filter(r -> r.productId() != null && r.cur().signum() > 0)
            .sorted(Comparator.comparing(ItemRow::cur).reversed())
            .limit(5)
            .map(OperationPanelService::move)
            .toList();
    }

    /** Quem mais ganhou ou perdeu em reais (não em %, que exagera o produto pequeno). */
    static List<ProductMove> movers(List<ItemRow> items, boolean rising) {
        Comparator<ItemRow> byDelta = Comparator.comparing(r -> r.cur().subtract(r.prev()));
        return items.stream()
            .filter(r -> r.productId() != null && (rising ? r.cur().compareTo(r.prev()) > 0 : r.cur().compareTo(r.prev()) < 0))
            .sorted(rising ? byDelta.reversed() : byDelta)
            .limit(3)
            .map(OperationPanelService::move)
            .toList();
    }

    /** Margem estimada pelo último custo de compra registrado; nula quando o custo cobre pouco do vendido. */
    private Margin margin(UUID marketId, List<ItemRow> items) {
        Map<UUID, BigDecimal> cost = new HashMap<>();
        jdbc.query(
            "select distinct on (product_id) product_id, unit_cost from purchase_price_history " +
            "where market_id = :m and unit_cost > 0 order by product_id, purchased_at desc",
            new MapSqlParameterSource("m", marketId),
            rs -> { cost.put(rs.getObject("product_id", UUID.class), rs.getBigDecimal("unit_cost")); });
        return margin(items, cost);
    }

    static Margin margin(List<ItemRow> items, Map<UUID, BigDecimal> cost) {
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal covered = BigDecimal.ZERO;
        BigDecimal costTotal = BigDecimal.ZERO;
        for (ItemRow r : items) {
            total = total.add(r.cur());
            BigDecimal unit = r.productId() == null ? null : cost.get(r.productId());
            if (unit != null && r.cur().signum() > 0) {
                covered = covered.add(r.cur());
                costTotal = costTotal.add(unit.multiply(r.curQty()));
            }
        }
        double coverage = total.signum() == 0 ? 0 : covered.divide(total, 6, RoundingMode.HALF_UP).doubleValue();
        if (coverage < MIN_COST_COVERAGE || covered.signum() == 0) {
            return new Margin(null, coverage);
        }
        return new Margin(covered.subtract(costTotal).divide(covered, 6, RoundingMode.HALF_UP).doubleValue() * 100.0, coverage);
    }

    static String comparisonLabel(Period period, LocalDate refDate, boolean today) {
        return switch (period) {
            case DIA -> "vs " + weekdayName(refDate) + (isWeekend(refDate) ? " passado" : " passada") + (today ? " até esta hora" : "");
            case SEMANA -> "vs os 7 dias anteriores";
            case MES -> "vs as 4 semanas anteriores";
        };
    }

    private static boolean isWeekend(LocalDate d) {
        return d.getDayOfWeek().getValue() >= 6;
    }

    private static final String[] WEEKDAY = { "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo" };
    private static final String[] WEEKDAY_PLURAL = { "segundas", "terças", "quartas", "quintas", "sextas", "sábados", "domingos" };

    static String weekdayName(LocalDate d) {
        return WEEKDAY[d.getDayOfWeek().getValue() - 1];
    }

    static String weekdayPlural(LocalDate d) {
        return WEEKDAY_PLURAL[d.getDayOfWeek().getValue() - 1];
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
