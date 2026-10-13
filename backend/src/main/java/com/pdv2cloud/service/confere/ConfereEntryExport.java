package com.pdv2cloud.service.confere;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * A nota de entrada no formato que um ERP grava: cabeçalho, itens já na
 * unidade de venda (caixa → unidade pela própria nota), custo por unidade de
 * venda e, depois da conferência, o que chegou de fato e as divergências.
 *
 * É o mesmo conteúdo do aviso ao Bipae e da API do Confere para o Bipae.
 */
@Service
public class ConfereEntryExport {

    private final NamedParameterJdbcTemplate jdbc;

    public ConfereEntryExport(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Cabeçalho da nota (sem itens), ou null. */
    public Map<String, Object> header(UUID marketId, UUID documentId) {
        List<Map<String, Object>> docs = jdbc.queryForList(
            "select id, access_key, number, series, emitter_cnpj, emitter_name, issued_at, total_value, items_count, volumes, " +
            "  source, completeness from nfe_documents where id = :d and market_id = :m",
            new MapSqlParameterSource("d", documentId).addValue("m", marketId));
        if (docs.isEmpty()) return null;
        Map<String, Object> d = docs.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("documentId", d.get("id"));
        out.put("accessKey", d.get("access_key"));
        out.put("number", d.get("number"));
        out.put("series", d.get("series"));
        out.put("supplierCnpj", d.get("emitter_cnpj"));
        out.put("supplierName", d.get("emitter_name"));
        out.put("issuedAt", d.get("issued_at") == null ? null : ((Timestamp) d.get("issued_at")).toLocalDateTime());
        out.put("totalValue", d.get("total_value"));
        out.put("itemsCount", d.get("items_count"));
        out.put("volumes", d.get("volumes"));
        out.put("source", d.get("source"));
        out.put("complete", "FULL".equals(d.get("completeness")));
        return out;
    }

    /**
     * Nota com os itens prontos para o ERP. Com conferência concluída, cada item
     * traz o que chegou ({@code receivedUnits}) e a divergência.
     */
    public Map<String, Object> entry(UUID marketId, UUID documentId) {
        Map<String, Object> out = header(marketId, documentId);
        if (out == null) return null;
        List<Map<String, Object>> check = jdbc.queryForList(
            "select id, status, finished_at, finished_by from confere_checks where market_id = :m and document_id = :d " +
            "order by started_at desc limit 1", new MapSqlParameterSource("m", marketId).addValue("d", documentId));
        boolean done = !check.isEmpty() && "DONE".equals(check.get(0).get("status"));
        out.put("checkStatus", check.isEmpty() ? "NAO_INICIADA" : done ? "CONCLUIDA" : "EM_ANDAMENTO");
        out.put("checkId", check.isEmpty() ? null : check.get(0).get("id"));
        out.put("checkedAt", done && check.get(0).get("finished_at") != null ? ((Timestamp) check.get(0).get("finished_at")).toLocalDateTime() : null);
        out.put("checkedBy", done ? check.get(0).get("finished_by") : null);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select i.item_number, coalesce(p.ean, i.gtin) as gtin, i.box_gtin, i.supplier_code, i.description, " +
            "  coalesce(p.name, i.description) as catalog_name, i.ncm, i.cfop, i.unit, i.quantity, i.unit_price, i.total, i.discount, " +
            "  i.tax_unit, i.tax_quantity, i.unit_cost, i.lot, i.expiry, e.expected_units, e.received_units, e.issue " +
            "from nfe_document_items i left join products p on p.id = i.product_id " +
            "left join confere_stock_entries e on e.check_id = cast(:c as uuid) and e.item_number = i.item_number " +
            "where i.document_id = :d and i.market_id = :m order by i.item_number",
            new MapSqlParameterSource("d", documentId).addValue("m", marketId)
                .addValue("c", done ? check.get(0).get("id") : null, java.sql.Types.OTHER));
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            BigDecimal q = (BigDecimal) r.get("quantity");
            BigDecimal tq = (BigDecimal) r.get("tax_quantity");
            BigDecimal ratio = q != null && q.signum() > 0 && tq != null && tq.signum() > 0
                ? tq.divide(q, 4, RoundingMode.HALF_UP) : BigDecimal.ONE;
            Map<String, Object> l = new LinkedHashMap<>();
            l.put("item", r.get("item_number"));
            l.put("gtin", r.get("gtin"));
            l.put("packGtin", r.get("box_gtin"));
            l.put("supplierCode", r.get("supplier_code"));
            l.put("invoiceDescription", r.get("description"));
            l.put("description", r.get("catalog_name"));
            l.put("ncm", r.get("ncm"));
            l.put("cfop", r.get("cfop"));
            l.put("invoiceUnit", r.get("unit"));
            l.put("invoiceQuantity", r.get("quantity"));
            l.put("invoiceUnitPrice", r.get("unit_price"));
            l.put("total", r.get("total"));
            l.put("discount", r.get("discount"));
            l.put("saleUnit", r.get("tax_unit"));
            l.put("unitsPerPack", ratio.stripTrailingZeros());
            l.put("expectedUnits", r.get("expected_units") != null ? r.get("expected_units")
                : q == null ? null : q.multiply(ratio).setScale(4, RoundingMode.HALF_UP));
            l.put("receivedUnits", r.get("received_units"));
            l.put("unitCost", r.get("unit_cost"));
            l.put("lot", r.get("lot"));
            l.put("expiry", r.get("expiry") == null ? null : String.valueOf(r.get("expiry")));
            l.put("divergence", r.get("issue"));
            items.add(l);
        }
        out.put("items", items);
        return out;
    }
}
