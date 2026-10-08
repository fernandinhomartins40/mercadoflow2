package com.pdv2cloud.service;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Produto × fornecedor, montado pelas notas lidas no Confere (NfeItemStore).
 * Um produto pode ter vários fornecedores; cada vínculo traz o código do
 * produto no fornecedor, a embalagem de compra e o último custo.
 */
@Service
public class SupplierProductService {

    /** Quantos produtos o fornecedor vende e quando foi a última nota dele. */
    public record SupplierStats(int productCount, LocalDateTime lastPurchaseAt) {}

    /** Um vínculo produto × fornecedor, para a tela. */
    public record Link(
        UUID supplierId, String supplierName, UUID productId, String productName, String ean, String imageUrl,
        String supplierCode, String purchaseUnit, BigDecimal unitsPerPack, BigDecimal lastUnitCost,
        LocalDateTime lastPurchaseAt, int purchases) {}

    private final NamedParameterJdbcTemplate jdbc;

    public SupplierProductService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<UUID, SupplierStats> stats(UUID marketId) {
        Map<UUID, SupplierStats> out = new HashMap<>();
        jdbc.query(
            "select supplier_id, count(*) n, max(last_purchase_at) last from supplier_products where market_id = :m group by supplier_id",
            Map.of("m", marketId),
            rs -> { out.put((UUID) rs.getObject("supplier_id"), new SupplierStats(rs.getInt("n"), time(rs.getTimestamp("last")))); });
        return out;
    }

    /** O que o fornecedor vende, do comprado mais recente para o mais antigo. */
    public List<Link> productsOf(UUID marketId, UUID supplierId) {
        return query("sp.supplier_id = :s", new MapSqlParameterSource().addValue("m", marketId).addValue("s", supplierId),
            "sp.last_purchase_at desc nulls last, p.name");
    }

    /** Quem vende cada produto, do fornecedor da compra mais recente para o mais antigo. */
    public List<Link> suppliersOf(UUID marketId, Collection<UUID> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            return List.of();
        }
        return query("sp.product_id in (:p) and s.is_active", new MapSqlParameterSource().addValue("m", marketId).addValue("p", productIds),
            "sp.product_id, sp.last_purchase_at desc nulls last");
    }

    private List<Link> query(String where, MapSqlParameterSource params, String order) {
        return jdbc.query(
            "select sp.supplier_id, coalesce(nullif(s.nome_fantasia, ''), s.razao_social) supplier_name, sp.product_id, " +
            "p.name product_name, p.ean, p.image_url, sp.supplier_code, sp.purchase_unit, sp.units_per_pack, sp.last_unit_cost, " +
            "sp.last_purchase_at, sp.purchases " +
            "from supplier_products sp join suppliers s on s.id = sp.supplier_id join products p on p.id = sp.product_id " +
            "where sp.market_id = :m and " + where + " order by " + order + " limit 2000",
            params,
            (rs, i) -> new Link((UUID) rs.getObject("supplier_id"), rs.getString("supplier_name"), (UUID) rs.getObject("product_id"),
                rs.getString("product_name"), rs.getString("ean"), rs.getString("image_url"), rs.getString("supplier_code"),
                rs.getString("purchase_unit"), rs.getBigDecimal("units_per_pack"), rs.getBigDecimal("last_unit_cost"),
                time(rs.getTimestamp("last_purchase_at")), rs.getInt("purchases")));
    }

    private static LocalDateTime time(Timestamp t) {
        return t == null ? null : t.toLocalDateTime();
    }
}
