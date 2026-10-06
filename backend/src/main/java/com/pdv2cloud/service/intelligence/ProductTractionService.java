package com.pdv2cloud.service.intelligence;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tração: quanto um produto puxa a venda de outros.
 *
 * Medida (validada nos dados reais em 06/10/2026, docs/AUDITORIA-ANALISES.md):
 * para cada cupom com o produto, o valor do RESTO do cupom menos o valor médio
 * de um cupom com o mesmo número de itens. A média disso é o "a mais por cupom".
 *
 * Por que controlar pelo número de itens: sem isso, todo produto que aparece em
 * compra grande parece puxar venda (o Raffaello "puxava" R$ 77 por cupom; com o
 * controle, R$ 4,60). A média do efeito na loja fica perto de zero, como deve.
 *
 * O z-score separa efeito de ruído: produto com poucos cupons pode ter média
 * alta por acaso. Os parceiros (lift >= 1,5 em >= 5 cupons) dizem O QUE vem junto.
 *
 * Só dias com histórico completo entram (DataCompletenessService).
 */
@Service
@Slf4j
public class ProductTractionService {

    static final int WINDOW_DAYS = 90;
    static final int MIN_BASKETS = 30;
    static final int MIN_PAIR_BASKETS = 5;
    static final double MIN_PARTNER_LIFT = 1.5;
    static final int MAX_PARTNERS = 8;
    /** Abaixo disto de dias completos a medida não é calculada (vira ruído). */
    static final int MIN_COMPLETE_DAYS = 21;

    private static final ObjectMapper JSON = new ObjectMapper();

    private final NamedParameterJdbcTemplate jdbc;
    private final DataCompletenessService completeness;

    public ProductTractionService(NamedParameterJdbcTemplate jdbc, DataCompletenessService completeness) {
        this.jdbc = jdbc;
        this.completeness = completeness;
    }

    public record Partner(UUID productId, String name, int baskets, double lift) { }

    public record Traction(
        UUID productId,
        String name,
        String imageUrl,
        String category,
        int baskets,
        int totalBaskets,
        BigDecimal ownRevenue,
        BigDecimal liftPerBasket,
        BigDecimal liftTotal,
        Double zScore,
        boolean significant,
        int strongPartners,
        List<Partner> partners,
        int completeDays,
        LocalDateTime computedAt
    ) { }

    /** Dias completos da janela em texto de array do PostgreSQL ("{2026-08-01,...}"). */
    public static String dayArray(List<LocalDate> days) {
        return days.stream().map(LocalDate::toString).collect(Collectors.joining(",", "{", "}"));
    }

    /** Recalcula e grava a tração do mercado. Devolve quantos produtos foram gravados. */
    @Transactional
    public int materialize(UUID marketId) {
        completeness.invalidate(marketId);
        DataCompletenessService.Coverage cov = completeness.coverage(marketId);
        LocalDate today = cov.today();
        List<LocalDate> days = cov.completeBetween(today.minusDays(WINDOW_DAYS), today);
        jdbc.update("delete from product_traction where market_id = :m", new MapSqlParameterSource("m", marketId));
        if (days.size() < MIN_COMPLETE_DAYS) {
            log.info("Tracao do mercado {}: so {} dias completos em {}; nao calculada", marketId, days.size(), WINDOW_DAYS);
            return 0;
        }
        MapSqlParameterSource p = new MapSqlParameterSource("m", marketId)
            .addValue("since", today.minusDays(WINDOW_DAYS).atStartOfDay())
            .addValue("days", dayArray(days))
            .addValue("minBaskets", MIN_BASKETS)
            .addValue("minPair", MIN_PAIR_BASKETS)
            .addValue("minLift", MIN_PARTNER_LIFT);

        String lines =
            "lines as (select i.id inv, it.product_id p, sum(it.valor_total) v " +
            "  from invoice_items it join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :m and i.data_emissao >= :since " +
            "    and cast(i.data_emissao as date) = any(cast(:days as date[])) and it.product_id is not null " +
            "  group by 1, 2) ";

        // 1. Efeito no cupom, controlado pelo número de itens.
        Map<UUID, Object[]> effect = new LinkedHashMap<>();
        final int[] total = { 0 };
        jdbc.query(
            "with " + lines + ", " +
            "basket as (select inv, sum(v) total, count(*) linhas from lines group by 1), " +
            "bysize as (select linhas k, avg(total) media_k from basket group by 1), " +
            "withp as (select l.p, l.v, b.total - l.v resto, b.linhas - 1 k from lines l join basket b using (inv) where b.linhas > 1), " +
            "ctrl as (select w.p, count(*) c, sum(w.v) rev, avg(w.resto - coalesce(s.media_k, 0)) delta, " +
            "  stddev_samp(w.resto - coalesce(s.media_k, 0)) sd from withp w left join bysize s on s.k = w.k group by 1 having count(*) >= :minBaskets) " +
            "select ctrl.*, (select count(*) from basket) n from ctrl",
            p,
            rs -> {
                total[0] = rs.getInt("n");
                double sd = rs.getDouble("sd");
                int c = rs.getInt("c");
                double delta = rs.getDouble("delta");
                Double z = sd > 0 ? delta / (sd / Math.sqrt(c)) : null;
                effect.put(rs.getObject("p", UUID.class), new Object[] { c, rs.getBigDecimal("rev"), delta, z });
            });
        if (effect.isEmpty()) {
            return 0;
        }

        // 2. Parceiros fortes de cada produto avaliado (o que vem junto).
        Map<UUID, List<Partner>> partners = new HashMap<>();
        Map<UUID, Integer> strongCount = new HashMap<>();
        jdbc.query(
            "with " + lines + ", " +
            "n as (select count(distinct inv) t from lines), " +
            "item as (select p, count(*) c from lines group by 1), " +
            "pairs as (select a.p pa, b.p pb, count(*) c from lines a join lines b on a.inv = b.inv and a.p <> b.p " +
            "  group by 1, 2 having count(*) >= :minPair) " +
            "select pr.pa, pr.pb, pr.c, pr.c::float * (select t from n) / (ia.c::float * ib.c) lift, p.name " +
            "from pairs pr join item ia on ia.p = pr.pa join item ib on ib.p = pr.pb join products p on p.id = pr.pb " +
            "where pr.c::float * (select t from n) / (ia.c::float * ib.c) >= :minLift",
            p,
            rs -> {
                UUID a = rs.getObject("pa", UUID.class);
                if (!effect.containsKey(a)) return;
                strongCount.merge(a, 1, Integer::sum);
                partners.computeIfAbsent(a, k -> new ArrayList<>())
                    .add(new Partner(rs.getObject("pb", UUID.class), rs.getString("name"), rs.getInt("c"), rs.getDouble("lift")));
            });

        LocalDateTime now = LocalDateTime.now();
        List<MapSqlParameterSource> rows = new ArrayList<>();
        effect.forEach((productId, e) -> {
            int c = (Integer) e[0];
            double delta = (Double) e[2];
            Double z = (Double) e[3];
            List<Partner> top = partners.getOrDefault(productId, List.of()).stream()
                .sorted((x, y) -> Integer.compare(y.baskets(), x.baskets()))
                .limit(MAX_PARTNERS)
                .toList();
            String json;
            try {
                json = JSON.writeValueAsString(top);
            } catch (Exception ex) {
                json = "[]";
            }
            rows.add(new MapSqlParameterSource()
                .addValue("m", marketId)
                .addValue("p", productId)
                .addValue("w", WINDOW_DAYS)
                .addValue("cd", days.size())
                .addValue("b", c)
                .addValue("tb", total[0])
                .addValue("rev", ((BigDecimal) e[1]).setScale(2, RoundingMode.HALF_UP))
                .addValue("lpb", BigDecimal.valueOf(delta).setScale(4, RoundingMode.HALF_UP))
                .addValue("lt", BigDecimal.valueOf(delta * c).setScale(2, RoundingMode.HALF_UP))
                .addValue("z", z == null ? null : BigDecimal.valueOf(z).setScale(4, RoundingMode.HALF_UP))
                .addValue("sp", strongCount.getOrDefault(productId, 0))
                .addValue("partners", json)
                .addValue("at", now));
        });
        jdbc.batchUpdate(
            "insert into product_traction (market_id, product_id, window_days, complete_days, baskets, total_baskets, own_revenue, " +
            "  lift_per_basket, lift_total, z_score, strong_partners, partners, computed_at) " +
            "values (:m, :p, :w, :cd, :b, :tb, :rev, :lpb, :lt, :z, :sp, cast(:partners as jsonb), :at)",
            rows.toArray(new MapSqlParameterSource[0]));
        log.info("Tracao do mercado {}: {} produtos em {} cupons de {} dias completos", marketId, rows.size(), total[0], days.size());
        return rows.size();
    }

    /** Lidos da tabela (rápido). {@code onlyPositive}: só quem puxa venda de forma significativa. */
    @Transactional(readOnly = true)
    public List<Traction> list(UUID marketId, boolean onlyPositive, int limit) {
        return jdbc.query(
            "select t.*, p.name, p.image_url, p.category from product_traction t join products p on p.id = t.product_id " +
            "where t.market_id = :m " + (onlyPositive ? "and t.lift_per_basket > 0 and coalesce(t.z_score, 0) >= 2 " : "") +
            "order by t.lift_total desc limit :lim",
            new MapSqlParameterSource("m", marketId).addValue("lim", limit),
            (rs, n) -> map(rs));
    }

    @Transactional(readOnly = true)
    public Traction forProduct(UUID marketId, UUID productId) {
        List<Traction> found = jdbc.query(
            "select t.*, p.name, p.image_url, p.category from product_traction t join products p on p.id = t.product_id " +
            "where t.market_id = :m and t.product_id = :p",
            new MapSqlParameterSource("m", marketId).addValue("p", productId),
            (rs, n) -> map(rs));
        return found.isEmpty() ? null : found.get(0);
    }

    private Traction map(java.sql.ResultSet rs) throws java.sql.SQLException {
        List<Partner> partners = new ArrayList<>();
        String json = rs.getString("partners");
        if (json != null) {
            try {
                for (Map<?, ?> m : JSON.readValue(json, Map[].class)) {
                    partners.add(new Partner(UUID.fromString(String.valueOf(m.get("productId"))), (String) m.get("name"),
                        ((Number) m.get("baskets")).intValue(), ((Number) m.get("lift")).doubleValue()));
                }
            } catch (Exception ignored) {
                // parceiros são complemento; a medida principal continua valendo
            }
        }
        BigDecimal z = rs.getBigDecimal("z_score");
        return new Traction(
            rs.getObject("product_id", UUID.class), rs.getString("name"), rs.getString("image_url"), rs.getString("category"),
            rs.getInt("baskets"), rs.getInt("total_baskets"), rs.getBigDecimal("own_revenue"),
            rs.getBigDecimal("lift_per_basket"), rs.getBigDecimal("lift_total"),
            z == null ? null : z.doubleValue(),
            z != null && z.doubleValue() >= 2 && rs.getBigDecimal("lift_per_basket").signum() > 0,
            rs.getInt("strong_partners"), partners, rs.getInt("complete_days"),
            rs.getTimestamp("computed_at").toLocalDateTime());
    }
}
