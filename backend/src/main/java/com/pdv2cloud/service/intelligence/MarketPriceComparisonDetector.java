package com.pdv2cloud.service.intelligence;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Compara o preço da loja com o das lojas próximas (Preço da vizinhança, só
 * Paraná — LocalPriceService), pelo resumo mais recente de cada produto.
 *
 * Antes (até 07/10/2026) comparava com a mediana de observações estaduais que,
 * na prática, eram só de Manaus e sem código de barras: nunca gerou um sinal.
 *
 * A régua é a faixa típica da vizinhança (25% a 75% dos preços), não a média:
 *  - ACIMA: o preço da loja passa 10% do topo da faixa; sugere voltar ao topo;
 *  - ABAIXO: está 8% abaixo do piso da faixa; é margem deixada na mesa e a
 *    sugestão é subir até o piso (continua entre os mais baratos da região);
 *  - ABAIXO_DO_CUSTO: a vizinhança vende abaixo do custo de compra da loja —
 *    negociar com o fornecedor antes de comprar de novo.
 * Sugerir preço exige 5 lojas ou mais (o alerta de custo, 3), e o resultado é sinal para conferir, nunca
 * veredito: a loja pode ter outro posicionamento.
 */
@Service
public class MarketPriceComparisonDetector {

    static final double ABOVE_PERCENT = 10.0;
    static final double BELOW_PERCENT = 8.0;
    static final int MIN_STORES_TO_SUGGEST = 5;
    private static final int SALES_WINDOW_DAYS = 30;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public MarketPriceComparisonDetector(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public enum Direction { ACIMA, ABAIXO, ABAIXO_DO_CUSTO }

    public record PriceComparison(
        UUID productId,
        String name,
        String imageUrl,
        BigDecimal ownPrice,
        BigDecimal marketMedianPrice,
        BigDecimal marketMinPrice,
        BigDecimal abovePercent,
        int observations,
        LocalDate lastObservedAt,
        BigDecimal quantitySold,
        BigDecimal revenueAtRisk,
        String description,
        Direction direction,
        BigDecimal p25Price,
        BigDecimal p75Price,
        BigDecimal suggestedPrice,
        String cheapestStore,
        BigDecimal cheapestDistanceKm,
        BigDecimal unitCost
    ) {}

    /** Mantido para o Centro de Inteligência: só os acima da faixa. */
    @Transactional(readOnly = true)
    public List<PriceComparison> detectAboveMarket(UUID marketId, int limit) {
        return detect(marketId, limit).stream().filter(c -> c.direction() == Direction.ACIMA).toList();
    }

    @Transactional(readOnly = true)
    public List<PriceComparison> detect(UUID marketId, int limit) {
        int max = limit > 0 ? limit : 30;
        MapSqlParameterSource params = new MapSqlParameterSource("m", marketId)
            .addValue("since", LocalDate.now().minusDays(SALES_WINDOW_DAYS).atStartOfDay());
        String sql =
            "with snap as ( " +
            "  select distinct on (s.product_id) s.* from local_price_snapshots s " +
            "  where s.market_id = :m and s.status = 'OK' and s.collected_on > current_date - 15 " +
            "  order by s.product_id, s.collected_on desc " +
            "), sold as ( " +
            "  select it.product_id, sum(it.valor_total) / nullif(sum(it.quantidade), 0) as own_price, sum(it.quantidade) as qty " +
            "  from invoice_items it join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :m and i.data_emissao >= :since and it.product_id is not null " +
            "  group by it.product_id having sum(it.quantidade) > 0 " +
            "), cost as ( " +
            "  select distinct on (h.product_id) h.product_id, h.unit_cost from purchase_price_history h " +
            "  where h.market_id = :m and h.unit_cost > 0 order by h.product_id, h.purchased_at desc " +
            ") " +
            "select s.product_id, p.name, p.image_url, so.own_price, so.qty, s.median_price, s.p25_price, s.p75_price, " +
            "  s.min_price, s.min_store, s.min_distance_km, s.stores, s.newest_seen, c.unit_cost " +
            "from snap s join sold so on so.product_id = s.product_id join products p on p.id = s.product_id " +
            "left join cost c on c.product_id = s.product_id";

        List<PriceComparison> out = new ArrayList<>();
        jdbcTemplate.query(sql, params, rs -> {
            BigDecimal own = rs.getBigDecimal("own_price");
            BigDecimal median = rs.getBigDecimal("median_price");
            BigDecimal p25 = rs.getBigDecimal("p25_price");
            BigDecimal p75 = rs.getBigDecimal("p75_price");
            BigDecimal qty = rs.getBigDecimal("qty");
            BigDecimal cost = rs.getBigDecimal("unit_cost");
            if (own == null || median == null || p25 == null || p75 == null || median.signum() <= 0) return;
            String name = rs.getString("name");
            int stores = rs.getInt("stores");

            Direction dir = null;
            BigDecimal suggested = null;
            BigDecimal impact = BigDecimal.ZERO;
            if (cost != null && median.compareTo(cost) < 0) {
                dir = Direction.ABAIXO_DO_CUSTO;
                impact = cost.subtract(median).multiply(qty);
            } else if (pct(own, p75) >= ABOVE_PERCENT) {
                dir = Direction.ACIMA;
                suggested = p75;
                // receita que deixaria de entrar ao voltar ao topo da faixa, mantido o volume
                impact = own.subtract(p75).multiply(qty);
            } else if (pct(p25, own) >= BELOW_PERCENT) {
                dir = Direction.ABAIXO;
                suggested = p25;
                // margem a mais por mês subindo ao piso da faixa, mantido o volume (hipótese a conferir)
                impact = p25.subtract(own).multiply(qty);
            }
            if (dir == null) return;
            // Sugerir preço pede base mais larga que o alerta de custo.
            if (dir != Direction.ABAIXO_DO_CUSTO && stores < MIN_STORES_TO_SUGGEST) return;
            BigDecimal diff = own.subtract(median).divide(median, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100));
            out.add(new PriceComparison(
                UUID.fromString(rs.getString("product_id")), name, rs.getString("image_url"),
                own.setScale(2, RoundingMode.HALF_UP), median, rs.getBigDecimal("min_price"),
                diff.setScale(2, RoundingMode.HALF_UP), stores,
                rs.getDate("newest_seen") == null ? null : rs.getDate("newest_seen").toLocalDate(),
                qty.setScale(3, RoundingMode.HALF_UP), impact.setScale(2, RoundingMode.HALF_UP),
                describe(dir, name, own, median, p25, p75, stores, cost, rs.getString("min_store"), rs.getBigDecimal("min_price")),
                dir, p25, p75, suggested, rs.getString("min_store"), rs.getBigDecimal("min_distance_km"), cost));
        });
        out.sort((a, b) -> b.revenueAtRisk().compareTo(a.revenueAtRisk()));
        return out.size() > max ? out.subList(0, max) : out;
    }

    /** Quanto {@code a} passa de {@code b}, em %. */
    static double pct(BigDecimal a, BigDecimal b) {
        if (b == null || b.signum() <= 0) return 0;
        return a.subtract(b).divide(b, 6, RoundingMode.HALF_UP).doubleValue() * 100;
    }

    private static String money(BigDecimal v) {
        return v == null ? "—" : "R$ " + v.setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',');
    }

    static String describe(Direction dir, String name, BigDecimal own, BigDecimal median, BigDecimal p25, BigDecimal p75,
                           int stores, BigDecimal cost, String cheapestStore, BigDecimal cheapest) {
        String range = String.format("Em %d lojas a até 10 km, o preço típico vai de %s a %s (mediana %s).",
            stores, money(p25), money(p75), money(median));
        String source = " Fonte: Menor Preço, do Nota Paraná.";
        return switch (dir) {
            case ACIMA -> String.format("Você vende %s a %s. %s Seu preço está acima da faixa: confira se é posicionamento.%s",
                name, money(own), range, source);
            case ABAIXO -> String.format("Você vende %s a %s. %s Seu preço está abaixo da faixa: dá para subir até %s e "
                + "continuar entre os mais baratos da região.%s", name, money(own), range, money(p25), source);
            case ABAIXO_DO_CUSTO -> String.format("A vizinhança vende %s por %s (mediana), abaixo do seu custo de compra de %s. "
                + "O mais barato é %s, a %s. Negocie com o fornecedor antes de comprar de novo.%s",
                name, money(median), money(cost), cheapestStore == null ? "—" : cheapestStore, money(cheapest), source);
        };
    }
}
