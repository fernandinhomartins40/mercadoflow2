package com.pdv2cloud.service.decision;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
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
 * Custo, preço e estoque informados nas decisões.
 *
 * Princípio (docs/PROPOSTA-DECISOES-E-INTEGRACAO.md): sem custo informado o
 * sistema não decide preço — ele pergunta. O que vem preenchido sempre diz de
 * onde veio; o que o lojista informa vira dado (custo em purchase_price_history
 * com source MANUAL, contagem em stock_counts) e volta preenchido da próxima vez.
 */
@Service
public class DecisionInputsService {

    private final NamedParameterJdbcTemplate jdbc;

    public DecisionInputsService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Known(
        UUID productId,
        String name,
        BigDecimal unitCost,
        String costSource,
        LocalDateTime costAt,
        BigDecimal averageSalePrice,
        BigDecimal officialPrice,
        BigDecimal stockUnits,
        LocalDateTime stockCountedAt,
        Map<String, Object> pendingNfe
    ) { }

    public record Input(UUID productId, BigDecimal unitCost, BigDecimal actionPrice, BigDecimal stockUnits) { }

    public record Saved(int costs, int counts, int recommendations) { }

    /** O que já se sabe de cada produto, para vir preenchido (com a fonte). */
    @Transactional(readOnly = true)
    public List<Known> known(UUID marketId, List<UUID> productIds) {
        if (productIds.isEmpty()) return List.of();
        MapSqlParameterSource p = new MapSqlParameterSource("m", marketId)
            .addValue("ids", productIds.stream().map(UUID::toString).collect(java.util.stream.Collectors.joining(",", "{", "}")));

        Map<UUID, Object[]> cost = new HashMap<>();
        jdbc.query(
            "select distinct on (product_id) product_id, unit_cost, source, purchased_at from purchase_price_history " +
            "where market_id = :m and product_id = any(cast(:ids as uuid[])) and unit_cost > 0 order by product_id, purchased_at desc",
            p, rs -> { cost.put(rs.getObject("product_id", UUID.class), new Object[] {
                rs.getBigDecimal("unit_cost"), rs.getString("source"), rs.getTimestamp("purchased_at").toLocalDateTime() }); });

        Map<UUID, Object[]> sale = new HashMap<>();
        jdbc.query(
            "select it.product_id, max(pr.name) as name, sum(it.valor_total) / nullif(sum(it.quantidade), 0) as avg_price " +
            "from invoice_items it join invoices i on i.id = it.invoice_id join products pr on pr.id = it.product_id " +
            "where i.market_id = :m and it.product_id = any(cast(:ids as uuid[])) and i.data_emissao >= now() - interval '30 days' " +
            "group by it.product_id",
            p, rs -> { sale.put(rs.getObject("product_id", UUID.class), new Object[] { rs.getString("name"), rs.getBigDecimal("avg_price") }); });

        Map<UUID, BigDecimal> official = new HashMap<>();
        jdbc.query(
            "select product_id, case when promo_price is not null and current_date between coalesce(promo_start, current_date) " +
            "  and coalesce(promo_end, current_date) then promo_price else price end as price " +
            "from product_price_list where market_id = :m and product_id = any(cast(:ids as uuid[]))",
            p, rs -> { official.put(rs.getObject("product_id", UUID.class), rs.getBigDecimal("price")); });

        Map<UUID, Object[]> count = new HashMap<>();
        jdbc.query(
            "select distinct on (product_id) product_id, units, counted_at from stock_counts " +
            "where market_id = :m and product_id = any(cast(:ids as uuid[])) order by product_id, counted_at desc",
            p, rs -> { count.put(rs.getObject("product_id", UUID.class), new Object[] {
                rs.getBigDecimal("units"), rs.getTimestamp("counted_at").toLocalDateTime() }); });

        // Nota de entrada que chegou pelo Confere e ainda não foi conferida: o custo
        // estaria lá, sem digitar.
        Map<UUID, Map<String, Object>> pending = new HashMap<>();
        jdbc.query(
            "select distinct on (d.product_id) d.product_id, d.issued_at, n.emitter_name " +
            "from nfe_document_items d join nfe_documents n on n.id = d.document_id " +
            "where d.market_id = :m and d.product_id = any(cast(:ids as uuid[])) " +
            "  and not exists (select 1 from confere_stock_entries e where e.document_id = d.document_id and e.product_id = d.product_id) " +
            "order by d.product_id, d.issued_at desc",
            p, rs -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("issuedAt", rs.getTimestamp("issued_at") != null ? rs.getTimestamp("issued_at").toLocalDateTime() : null);
                m.put("supplier", rs.getString("emitter_name"));
                pending.put(rs.getObject("product_id", UUID.class), m);
            });

        Map<UUID, String> names = new HashMap<>();
        jdbc.query("select id, name from products where id = any(cast(:ids as uuid[]))", p,
            rs -> { names.put(rs.getObject("id", UUID.class), rs.getString("name")); });

        List<Known> out = new ArrayList<>();
        for (UUID id : productIds) {
            Object[] c = cost.get(id);
            Object[] s = sale.get(id);
            Object[] k = count.get(id);
            out.add(new Known(
                id,
                s != null && s[0] != null ? (String) s[0] : names.get(id),
                c != null ? (BigDecimal) c[0] : null,
                c != null ? (String) c[1] : null,
                c != null ? (LocalDateTime) c[2] : null,
                s != null && s[1] != null ? ((BigDecimal) s[1]).setScale(2, RoundingMode.HALF_UP) : null,
                official.get(id),
                k != null ? (BigDecimal) k[0] : null,
                k != null ? (LocalDateTime) k[1] : null,
                pending.get(id)));
        }
        return out;
    }

    /**
     * Grava o que o lojista informou. Custo sem compra entra com quantidade 0
     * (não mexe no estoque); a contagem vira o ponto de partida do estoque.
     * Com {@code recommendationId}, guarda também preço e custo na recomendação,
     * para a medição do resultado usar o que foi de fato praticado.
     */
    @Transactional
    public Saved save(UUID marketId, String user, UUID recommendationId, List<Input> inputs) {
        int costs = 0;
        int counts = 0;
        int recs = 0;
        for (Input in : inputs) {
            if (in.productId() == null) continue;
            validate(in);
            if (in.unitCost() != null) {
                jdbc.update(
                    "insert into purchase_price_history (market_id, product_id, quantity_purchased, unit_cost, unit_sale_price, " +
                    "  margin_percent, source, note, purchased_at) values (:m, :p, 0, :c, :s, :mg, 'MANUAL', :n, now())",
                    new MapSqlParameterSource("m", marketId).addValue("p", in.productId()).addValue("c", in.unitCost())
                        .addValue("s", in.actionPrice())
.addValue("mg", markup(in.unitCost(), in.actionPrice()))
                        .addValue("n", "Informado por " + (user == null ? "lojista" : user)));
                costs++;
            }
            if (in.stockUnits() != null) {
                jdbc.update(
                    "insert into stock_counts (market_id, product_id, units, source, created_by) values (:m, :p, :u, 'MANUAL', :by)",
                    new MapSqlParameterSource("m", marketId).addValue("p", in.productId()).addValue("u", in.stockUnits()).addValue("by", user));
                counts++;
            }
            if (recommendationId != null && (in.actionPrice() != null || in.unitCost() != null)) {
                recs += jdbc.update(
                    "update recommendations set parameters = coalesce(parameters, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(" +
                    "  'precoInformado', cast(:price as numeric), 'custoInformado', cast(:cost as numeric), " +
                    "  'margemInformada', cast(:mg as numeric))) " +
                    "where id = :r and market_id = :m and status = 'PROPOSTA'",
                    new MapSqlParameterSource("m", marketId).addValue("r", recommendationId)
                        .addValue("price", in.actionPrice()).addValue("cost", in.unitCost())
                        .addValue("mg", margin(in.unitCost(), in.actionPrice())));
            }
        }
        return new Saved(costs, counts, recs);
    }

    /**
     * O que falta para aceitar uma recomendação de promover, liquidar ou comprar:
     * custo conhecido (registrado ou informado) e, para promover e liquidar, o
     * preço que será praticado. Null quando pode aceitar.
     */
    @Transactional(readOnly = true)
    public String missingForRecommendation(UUID marketId, UUID recommendationId) {
        List<java.util.Map<String, Object>> rows = jdbc.queryForList(
            "select r.action_type, r.parameters->>'acao' as acao, r.parameters->>'precoInformado' as preco, " +
            "  r.parameters->>'precoLiquidacao' as preco_liq, r.parameters->>'custoInformado' as custo, " +
            "  (select h.unit_cost from purchase_price_history h where h.market_id = r.market_id " +
            "     and h.product_id = coalesce(op.product_id, cast(r.parameters->>'produtoId' as uuid)) and h.unit_cost > 0 limit 1) as known_cost, " +
            "  (select i.unit_cost from supplier_order_items i join supplier_orders so on so.id = i.supplier_order_id " +
            "     where so.market_id = r.market_id and i.product_id = coalesce(op.product_id, cast(r.parameters->>'produtoId' as uuid)) " +
            "     and i.unit_cost > 0 limit 1) as order_cost " +
            "from recommendations r join opportunities op on op.id = r.opportunity_id where r.market_id = :m and r.id = :r",
            new MapSqlParameterSource("m", marketId).addValue("r", recommendationId));
        if (rows.isEmpty()) return null;
        java.util.Map<String, Object> r = rows.get(0);
        String action = String.valueOf(r.get("action_type"));
        if (!java.util.Set.of("PROMOVER", "LIQUIDAR", "COMPRAR").contains(action) || "reduzir_proxima_compra".equals(r.get("acao"))) return null;
        boolean cost = r.get("custo") != null || r.get("known_cost") != null || r.get("order_cost") != null;
        boolean price = switch (action) {
            case "PROMOVER" -> r.get("preco") != null;
            case "LIQUIDAR" -> r.get("preco") != null || r.get("preco_liq") != null;
            default -> true;
        };
        if (cost && price) return null;
        return !cost && !price ? "Informe o custo e o preço da ação antes de aceitar."
            : !cost ? "Informe o custo do produto antes de aceitar." : "Informe o preço da ação antes de aceitar.";
    }

    static void validate(Input in) {
        if (in.unitCost() != null && in.unitCost().signum() <= 0) throw new IllegalArgumentException("O custo precisa ser maior que zero.");
        if (in.actionPrice() != null && in.actionPrice().signum() <= 0) throw new IllegalArgumentException("O preço precisa ser maior que zero.");
        if (in.stockUnits() != null && in.stockUnits().signum() < 0) throw new IllegalArgumentException("O estoque não pode ser negativo.");
    }

    /** Margem sobre o custo (a convenção da coluna margin_percent da V23), em %. */
    static BigDecimal markup(BigDecimal cost, BigDecimal price) {
        if (cost == null || price == null || cost.signum() <= 0) return null;
        return price.subtract(cost).divide(cost, 6, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100)).setScale(4, RoundingMode.HALF_UP);
    }

    /** Margem sobre o preço de venda, em %. Nula sem os dois valores. */
    static BigDecimal margin(BigDecimal cost, BigDecimal price) {
        if (cost == null || price == null || price.signum() <= 0) return null;
        return price.subtract(cost).divide(price, 6, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP);
    }
}
