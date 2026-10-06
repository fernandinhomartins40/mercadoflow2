package com.pdv2cloud.service.partner;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * O que sai para o ERP: a "entrada de mercadoria pronta", a partir das notas de
 * entrada que o Confere busca na SEFAZ — cadastro do produto (com embalagem,
 * conversão e dados enriquecidos) e a entrada conferida, prontos para gravar.
 *
 * Travas (docs/PROPOSTA-DECISOES-E-INTEGRACAO.md):
 *  - só produtos que aparecem nas notas DESTA loja; nunca o catálogo inteiro;
 *  - troca obrigatória: o parceiro precisa ter enviado estoque e preços desta
 *    loja nos últimos {@link #RECIPROCITY_DAYS} dias;
 *  - nada de desempenho, giro, tração, sazonalidade, previsão ou score.
 */
@Service
@Profile("!jobs")
public class PartnerOutboundService {

    public static final int RECIPROCITY_DAYS = 7;
    public static final int MAX_PAGE = 500;

    private final NamedParameterJdbcTemplate jdbc;

    public PartnerOutboundService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Null quando a troca está em dia; senão, o motivo (vai na resposta 409). */
    public String reciprocityProblem(UUID partnerId, UUID marketId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select last_stock_at, last_prices_at from partner_market_links where partner_id = :p and market_id = :m and status = 'ATIVO'",
            new MapSqlParameterSource("p", partnerId).addValue("m", marketId));
        if (rows.isEmpty()) return "Esta loja não autorizou o seu acesso.";
        LocalDateTime limit = LocalDateTime.now().minusDays(RECIPROCITY_DAYS);
        Timestamp stock = (Timestamp) rows.get(0).get("last_stock_at");
        Timestamp prices = (Timestamp) rows.get(0).get("last_prices_at");
        List<String> missing = new ArrayList<>();
        if (stock == null || stock.toLocalDateTime().isBefore(limit)) missing.add("estoque (/stock)");
        if (prices == null || prices.toLocalDateTime().isBefore(limit)) missing.add("preços (/prices)");
        return missing.isEmpty() ? null
            : "Para receber as entradas prontas desta loja, envie " + String.join(" e ", missing)
                + " desta loja ao menos uma vez a cada " + RECIPROCITY_DAYS + " dias.";
    }

    /** Fator caixa → unidade de venda pela NF-e (qTrib / qCom), como o Confere faz. */
    static BigDecimal unitsPerPack(BigDecimal quantity, BigDecimal taxQuantity) {
        if (quantity == null || taxQuantity == null || quantity.signum() <= 0 || taxQuantity.signum() <= 0) return BigDecimal.ONE;
        return taxQuantity.divide(quantity, 4, RoundingMode.HALF_UP);
    }

    /**
     * Cadastro pronto de cada produto que chegou nas notas da loja desde {@code since}.
     * Paginação por cursor: a resposta traz {@code nextSince}.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> inboundProducts(UUID marketId, LocalDateTime since, int limit, String baseUrl) {
        int size = Math.max(1, Math.min(limit, MAX_PAGE));
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select distinct on (coalesce(p.id::text, d.gtin, d.supplier_code)) " +
            "  d.issued_at, d.gtin, d.box_gtin, d.supplier_cnpj, d.supplier_code, d.description as nfe_description, d.ncm, d.unit, " +
            "  d.quantity, d.tax_quantity, d.tax_unit, p.id as product_id, p.ean, p.name, p.brand, p.category, p.image_url " +
            "from nfe_document_items d left join products p on p.id = d.product_id " +
            "where d.market_id = :m and d.issued_at > :since " +
            "order by coalesce(p.id::text, d.gtin, d.supplier_code), d.issued_at desc",
            new MapSqlParameterSource("m", marketId).addValue("since", Timestamp.valueOf(since)));
        rows.sort((a, b) -> ((Timestamp) a.get("issued_at")).compareTo((Timestamp) b.get("issued_at")));
        List<Map<String, Object>> page = rows.subList(0, Math.min(size, rows.size()));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : page) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("gtin", r.get("ean") != null ? r.get("ean") : r.get("gtin"));
            m.put("packGtin", r.get("box_gtin"));
            m.put("unitsPerPack", unitsPerPack((BigDecimal) r.get("quantity"), (BigDecimal) r.get("tax_quantity")));
            m.put("supplierCnpj", r.get("supplier_cnpj"));
            m.put("supplierCode", r.get("supplier_code"));
            m.put("description", r.get("name") != null ? r.get("name") : r.get("nfe_description"));
            m.put("invoiceDescription", r.get("nfe_description"));
            m.put("brand", r.get("brand"));
            m.put("department", r.get("category"));
            m.put("ncm", r.get("ncm"));
            m.put("purchaseUnit", r.get("unit"));
            m.put("saleUnit", r.get("tax_unit"));
            String img = (String) r.get("image_url");
            m.put("imageUrl", img == null ? null : img.startsWith("http") ? img : baseUrl + img);
            m.put("lastInvoiceAt", ((Timestamp) r.get("issued_at")).toLocalDateTime());
            out.add(m);
        }
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("items", out);
        res.put("nextSince", out.isEmpty() ? since : out.get(out.size() - 1).get("lastInvoiceAt"));
        res.put("hasMore", rows.size() > page.size());
        return res;
    }

    /** Entradas prontas: nota de entrada com itens já na unidade de venda e o que foi conferido. */
    @Transactional(readOnly = true)
    public Map<String, Object> inboundReceipts(UUID marketId, LocalDateTime since, int limit) {
        int size = Math.max(1, Math.min(limit, 100));
        List<Map<String, Object>> docs = jdbc.queryForList(
            "select id, access_key, number, series, emitter_cnpj, emitter_name, issued_at, total_value, created_at " +
            "from nfe_documents where market_id = :m and created_at > :since order by created_at limit :l",
            new MapSqlParameterSource("m", marketId).addValue("since", Timestamp.valueOf(since)).addValue("l", size + 1));
        boolean more = docs.size() > size;
        if (more) docs = docs.subList(0, size);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> doc : docs) {
            List<Map<String, Object>> items = jdbc.queryForList(
                "select d.item_number, coalesce(p.ean, d.gtin) as gtin, d.box_gtin, d.supplier_code, coalesce(p.name, d.description) as description, " +
                "  d.quantity, d.tax_quantity, d.unit, d.unit_cost, d.lot, d.expiry, " +
                "  e.expected_units, e.received_units, e.issue " +
                "from nfe_document_items d left join products p on p.id = d.product_id " +
                "left join confere_stock_entries e on e.document_id = d.document_id and e.item_number = d.item_number " +
                "where d.document_id = :d order by d.item_number",
                new MapSqlParameterSource("d", doc.get("id")));
            List<Map<String, Object>> lines = new ArrayList<>();
            boolean conferred = false;
            for (Map<String, Object> it : items) {
                BigDecimal ratio = unitsPerPack((BigDecimal) it.get("quantity"), (BigDecimal) it.get("tax_quantity"));
                BigDecimal invoiceUnits = it.get("quantity") == null ? null : ((BigDecimal) it.get("quantity")).multiply(ratio);
                Map<String, Object> l = new LinkedHashMap<>();
                l.put("item", it.get("item_number"));
                l.put("gtin", it.get("gtin"));
                l.put("packGtin", it.get("box_gtin"));
                l.put("supplierCode", it.get("supplier_code"));
                l.put("description", it.get("description"));
                l.put("invoiceQuantity", it.get("quantity"));
                l.put("invoiceUnit", it.get("unit"));
                l.put("unitsPerPack", ratio);
                l.put("invoiceUnits", invoiceUnits);
                l.put("receivedUnits", it.get("received_units"));
                l.put("unitCost", it.get("unit_cost"));
                l.put("lot", it.get("lot"));
                l.put("expiry", it.get("expiry"));
                l.put("divergence", it.get("issue"));
                if (it.get("received_units") != null) conferred = true;
                lines.add(l);
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("accessKey", doc.get("access_key"));
            m.put("number", doc.get("number"));
            m.put("series", doc.get("series"));
            m.put("supplierCnpj", doc.get("emitter_cnpj"));
            m.put("supplierName", doc.get("emitter_name"));
            m.put("issuedAt", doc.get("issued_at"));
            m.put("totalValue", doc.get("total_value"));
            m.put("conferred", conferred);
            m.put("items", lines);
            m.put("cursor", ((Timestamp) doc.get("created_at")).toLocalDateTime());
            out.add(m);
        }
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("items", out);
        res.put("nextSince", out.isEmpty() ? since : out.get(out.size() - 1).get("cursor"));
        res.put("hasMore", more);
        return res;
    }
}
