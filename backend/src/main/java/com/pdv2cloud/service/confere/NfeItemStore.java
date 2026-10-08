package com.pdv2cloud.service.confere;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Tira do XML guardado os dados que não podem se perder e que o resto do
 * sistema consulta sem abrir o XML: itens da nota (com GTIN ligado ao
 * catálogo), fornecedor, endereço do mercado e, ao fechar a conferência, as
 * entradas de estoque.
 *
 * Tudo é idempotente: ler a mesma nota de novo ou refazer a conferência
 * substitui as linhas, nunca duplica.
 */
@Component
public class NfeItemStore {

    private final NamedParameterJdbcTemplate jdbc;

    public NfeItemStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Grava itens, fornecedor e local de uma nota completa. */
    public void extract(UUID marketId, UUID documentId, NfeXml.Data d) {
        if (!d.full()) {
            return;
        }
        saveSupplier(d);
        saveMarketLocation(marketId, d);
        UUID supplierId = upsertMarketSupplier(marketId, d);

        Map<String, UUID> products = productIds(d.items());
        jdbc.update("delete from nfe_document_items where document_id = :d and market_id = :m",
            Map.of("d", documentId, "m", marketId));
        List<MapSqlParameterSource> rows = new ArrayList<>();
        for (NfeXml.Item it : d.items()) {
            String gtin = it.taxEan() != null ? it.taxEan() : it.ean();
            UUID productId = gtin == null ? null : products.get(gtin);
            if (productId == null && it.ean() != null) {
                productId = products.get(it.ean());
            }
            rows.add(new MapSqlParameterSource()
                .addValue("m", marketId).addValue("d", documentId).addValue("n", it.number())
                .addValue("sc", d.emitterCnpj())
                .addValue("iss", d.issuedAt() == null ? null : Timestamp.valueOf(d.issuedAt()))
                .addValue("gtin", gtin).addValue("box", it.ean() != null && !it.ean().equals(gtin) ? it.ean() : null)
                .addValue("pid", productId).addValue("code", cut(it.code(), 60)).addValue("desc", cut(it.name(), 160))
                .addValue("ncm", cut(it.ncm(), 8)).addValue("cfop", cut(it.cfop(), 4)).addValue("unit", cut(it.unit(), 6))
                .addValue("q", it.quantity()).addValue("up", it.unitPrice()).addValue("tot", it.total())
                .addValue("disc", it.discount()).addValue("tu", cut(it.taxUnit(), 6)).addValue("tq", it.taxQuantity())
                .addValue("uc", unitCost(it)).addValue("lot", cut(it.lot(), 40)).addValue("exp", date(it.expiry())));
        }
        if (!rows.isEmpty()) {
            jdbc.batchUpdate(
                "insert into nfe_document_items (market_id, document_id, item_number, supplier_cnpj, issued_at, gtin, box_gtin, " +
                "product_id, supplier_code, description, ncm, cfop, unit, quantity, unit_price, total, discount, tax_unit, " +
                "tax_quantity, unit_cost, lot, expiry) values (:m, :d, :n, :sc, :iss, :gtin, :box, :pid, :code, :desc, :ncm, " +
                ":cfop, :unit, :q, :up, :tot, :disc, :tu, :tq, :uc, :lot, :exp)",
                rows.toArray(new MapSqlParameterSource[0]));
        }
        if (supplierId != null) {
            linkSupplierProducts(marketId, supplierId, documentId, d.emitterCnpj());
        }
        jdbc.update(
            "update nfe_documents set items_extracted = true, supplier_uf = :uf, supplier_city = :city where id = :d and market_id = :m",
            new MapSqlParameterSource().addValue("d", documentId).addValue("m", marketId)
                .addValue("uf", d.emitterAddress() == null ? null : cut(d.emitterAddress().uf(), 2))
                .addValue("city", d.emitterAddress() == null ? null : cut(d.emitterAddress().city(), 80)));
    }

    /**
     * Custo de uma unidade de venda: valor do item (menos desconto) dividido
     * pela quantidade tributável, que é a unidade do código de barras de venda.
     * Sem qTrib, cai para o preço unitário comercial.
     */
    static BigDecimal unitCost(NfeXml.Item it) {
        if (it.total() == null) {
            return it.unitPrice();
        }
        BigDecimal value = it.discount() == null ? it.total() : it.total().subtract(it.discount());
        BigDecimal q = it.taxQuantity() != null && it.taxQuantity().signum() > 0 ? it.taxQuantity() : it.quantity();
        if (q == null || q.signum() <= 0) {
            return it.unitPrice();
        }
        return value.divide(q, 6, RoundingMode.HALF_UP);
    }

    /**
     * O emitente da nota entra no cadastro de fornecedores do mercado. Se já
     * existe, só preenche o que estiver vazio (não troca o que o dono digitou);
     * removido pelo dono continua removido. Nota emitida pelo próprio mercado
     * (transferência entre filiais) não vira fornecedor.
     */
    UUID upsertMarketSupplier(UUID marketId, NfeXml.Data d) {
        String cnpj = d.emitterCnpj();
        if (cnpj == null || cnpj.length() != 14) {
            return null;
        }
        List<String> own = jdbc.queryForList("select cnpj from markets where id = :id", Map.of("id", marketId), String.class);
        if (!own.isEmpty() && own.get(0) != null && cnpj.equals(own.get(0).replaceAll("\\D", ""))) {
            return null;
        }
        NfeXml.Address a = d.emitterAddress();
        String street = a == null ? null : cut(a.street() == null ? null : (a.number() == null ? a.street() : a.street() + ", " + a.number()), 255);
        List<UUID> id = jdbc.queryForList(
            "insert into suppliers (market_id, cnpj, razao_social, nome_fantasia, telefone, logradouro, municipio, uf, cep, source) " +
            "values (:m, :c, :rs, :nf, :tel, :lg, :mun, :uf, :cep, 'CONFERE') " +
            "on conflict (market_id, cnpj) do update set " +
            "nome_fantasia = coalesce(nullif(suppliers.nome_fantasia, ''), excluded.nome_fantasia), " +
            "telefone = coalesce(nullif(suppliers.telefone, ''), excluded.telefone), " +
            "logradouro = coalesce(nullif(suppliers.logradouro, ''), excluded.logradouro), " +
            "municipio = coalesce(nullif(suppliers.municipio, ''), excluded.municipio), " +
            "uf = coalesce(nullif(suppliers.uf, ''), excluded.uf), cep = coalesce(nullif(suppliers.cep, ''), excluded.cep), " +
            "updated_at = now() returning id",
            new MapSqlParameterSource().addValue("m", marketId).addValue("c", cnpj)
                .addValue("rs", cut(d.emitterName() == null || d.emitterName().isBlank() ? cnpj : d.emitterName(), 255))
                .addValue("nf", cut(d.emitterTradeName(), 255)).addValue("tel", a == null ? null : cut(a.phone(), 30))
                .addValue("lg", street).addValue("mun", a == null ? null : cut(a.city(), 100))
                .addValue("uf", a == null ? null : cut(a.uf(), 2)).addValue("cep", a == null ? null : cut(a.postalCode(), 10)),
            UUID.class);
        return id.isEmpty() ? null : id.get(0);
    }

    /**
     * Cada produto da nota fica ligado ao fornecedor (um produto pode ter vários).
     * O "último" (custo, embalagem, código) só muda com nota igual ou mais nova;
     * o número de compras é recontado das notas, então reprocessar não duplica.
     */
    private void linkSupplierProducts(UUID marketId, UUID supplierId, UUID documentId, String cnpj) {
        jdbc.update(
            "insert into supplier_products (market_id, supplier_id, product_id, supplier_code, purchase_unit, units_per_pack, " +
            "last_unit_cost, last_purchase_at, purchases, last_document_id) " +
            "select :m, :s, i.product_id, max(i.supplier_code), max(i.unit), " +
            "max(case when i.quantity > 0 and i.tax_quantity > i.quantity then round(i.tax_quantity / i.quantity, 3) end), " +
            "max(i.unit_cost), max(i.issued_at), " +
            "(select count(distinct x.document_id) from nfe_document_items x where x.market_id = :m and x.supplier_cnpj = :c and x.product_id = i.product_id), " +
            ":d from nfe_document_items i where i.document_id = :d and i.market_id = :m and i.product_id is not null group by i.product_id " +
            "on conflict (supplier_id, product_id) do update set " +
            "purchases = excluded.purchases, updated_at = now(), " +
            "supplier_code = case when excluded.last_purchase_at >= coalesce(supplier_products.last_purchase_at, '-infinity') then coalesce(excluded.supplier_code, supplier_products.supplier_code) else supplier_products.supplier_code end, " +
            "purchase_unit = case when excluded.last_purchase_at >= coalesce(supplier_products.last_purchase_at, '-infinity') then coalesce(excluded.purchase_unit, supplier_products.purchase_unit) else supplier_products.purchase_unit end, " +
            "units_per_pack = case when excluded.last_purchase_at >= coalesce(supplier_products.last_purchase_at, '-infinity') then excluded.units_per_pack else supplier_products.units_per_pack end, " +
            "last_unit_cost = case when excluded.last_purchase_at >= coalesce(supplier_products.last_purchase_at, '-infinity') then coalesce(excluded.last_unit_cost, supplier_products.last_unit_cost) else supplier_products.last_unit_cost end, " +
            "last_document_id = case when excluded.last_purchase_at >= coalesce(supplier_products.last_purchase_at, '-infinity') then excluded.last_document_id else supplier_products.last_document_id end, " +
            "last_purchase_at = greatest(excluded.last_purchase_at, supplier_products.last_purchase_at)",
            new MapSqlParameterSource().addValue("m", marketId).addValue("s", supplierId).addValue("d", documentId).addValue("c", cnpj));
    }

    /** Fornecedor é empresa (CNPJ): dado público, fora da regra de mercado. */
    private void saveSupplier(NfeXml.Data d) {
        if (d.emitterCnpj() == null || d.emitterCnpj().length() != 14) {
            return;
        }
        NfeXml.Address a = d.emitterAddress();
        jdbc.update(
            "insert into nfe_suppliers (cnpj, name, trade_name, city, city_code, uf) values (:c, :n, :t, :city, :cc, :uf) " +
            "on conflict (cnpj) do update set name = coalesce(excluded.name, nfe_suppliers.name), " +
            "trade_name = coalesce(excluded.trade_name, nfe_suppliers.trade_name), city = coalesce(excluded.city, nfe_suppliers.city), " +
            "city_code = coalesce(excluded.city_code, nfe_suppliers.city_code), uf = coalesce(excluded.uf, nfe_suppliers.uf), updated_at = now()",
            new MapSqlParameterSource().addValue("c", d.emitterCnpj()).addValue("n", cut(d.emitterName(), 200))
                .addValue("t", cut(d.emitterTradeName(), 200))
                .addValue("city", a == null ? null : cut(a.city(), 80)).addValue("cc", a == null ? null : cut(a.cityCode(), 7))
                .addValue("uf", a == null ? null : cut(a.uf(), 2)));
    }

    /**
     * O endereço de destino é o do mercado só quando o CNPJ do destinatário é
     * o do mercado (mesma raiz). Nota de outra filial ou de terceiro não mexe.
     */
    private void saveMarketLocation(UUID marketId, NfeXml.Data d) {
        NfeXml.Address a = d.recipientAddress();
        if (a == null || a.cityCode() == null || d.recipientCnpj() == null) {
            return;
        }
        List<String> cnpj = jdbc.queryForList("select cnpj from markets where id = :id", Map.of("id", marketId), String.class);
        String own = cnpj.isEmpty() || cnpj.get(0) == null ? "" : cnpj.get(0).replaceAll("\\D", "");
        if (own.length() != 14 || !own.equals(d.recipientCnpj())) {
            return;
        }
        jdbc.update(
            "insert into market_locations (market_id, street, number, neighborhood, city, city_code, uf, postal_code) " +
            "values (:m, :s, :n, :b, :c, :cc, :uf, :cep) on conflict (market_id) do update set street = excluded.street, " +
            "number = excluded.number, neighborhood = excluded.neighborhood, city = excluded.city, city_code = excluded.city_code, " +
            "uf = excluded.uf, postal_code = excluded.postal_code, updated_at = now() where market_locations.source = 'NFE_DEST'",
            new MapSqlParameterSource().addValue("m", marketId).addValue("s", cut(a.street(), 120)).addValue("n", cut(a.number(), 20))
                .addValue("b", cut(neighborhood(a.neighborhood()), 80)).addValue("c", cut(a.city(), 80))
                .addValue("cc", cut(a.cityCode(), 7)).addValue("uf", cut(a.uf(), 2)).addValue("cep", cut(a.postalCode(), 8)));
    }

    /** Bairro em caixa alta e sem espaço sobrando, para agrupar igual. */
    static String neighborhood(String v) {
        return v == null ? null : v.trim().replaceAll("\\s+", " ").toUpperCase(java.util.Locale.ROOT);
    }

    /** Liga pelo GTIN ao catálogo global (só produtos que já existem). */
    private Map<String, UUID> productIds(List<NfeXml.Item> items) {
        List<String> gtins = new ArrayList<>();
        for (NfeXml.Item it : items) {
            if (it.ean() != null) gtins.add(it.ean());
            if (it.taxEan() != null) gtins.add(it.taxEan());
        }
        Map<String, UUID> out = new HashMap<>();
        if (!gtins.isEmpty()) {
            jdbc.query("select id, ean from products where ean in (:e)", Map.of("e", gtins),
                rs -> { out.put(rs.getString("ean"), (UUID) rs.getObject("id")); });
        }
        return out;
    }

    // ── Estoque ───────────────────────────────────────────────────────────

    /**
     * Ao fechar a conferência: uma entrada por item com o que chegou de fato
     * (nulo quando o item não foi contado).
     * A contagem é na unidade da nota (uCom); a entrada vai em unidades de
     * venda, multiplicando pela razão qTrib/qCom (caixa de 12 → 12 unidades).
     */
    public int writeStockEntries(UUID marketId, UUID documentId, UUID checkId, Map<String, Object> counts) {
        jdbc.update("delete from confere_stock_entries where check_id = :c and market_id = :m", Map.of("c", checkId, "m", marketId));
        List<Map<String, Object>> items = jdbc.queryForList(
            "select * from nfe_document_items where document_id = :d and market_id = :m order by item_number",
            Map.of("d", documentId, "m", marketId));
        List<MapSqlParameterSource> rows = new ArrayList<>();
        for (Map<String, Object> it : items) {
            int n = ((Number) it.get("item_number")).intValue();
            BigDecimal q = (BigDecimal) it.get("quantity");
            BigDecimal tq = (BigDecimal) it.get("tax_quantity");
            BigDecimal ratio = q != null && q.signum() > 0 && tq != null && tq.signum() > 0
                ? tq.divide(q, 6, RoundingMode.HALF_UP) : BigDecimal.ONE;
            Object raw = counts == null ? null : counts.get(String.valueOf(n));
            // Sem contagem fica nulo: "não conferido" é diferente de "chegou tudo".
            BigDecimal counted = null;
            String issue = null;
            if (raw instanceof Map<?, ?> c) {
                Object v = c.get("counted");
                if (v instanceof Number num) {
                    counted = new BigDecimal(num.toString());
                }
                issue = c.get("issue") == null ? null : cut(String.valueOf(c.get("issue")), 12);
            }
            rows.add(new MapSqlParameterSource()
                .addValue("m", marketId).addValue("d", documentId).addValue("c", checkId).addValue("n", n)
                .addValue("pid", it.get("product_id")).addValue("gtin", it.get("gtin")).addValue("desc", it.get("description"))
                .addValue("exp", q == null ? null : q.multiply(ratio).setScale(4, RoundingMode.HALF_UP))
                .addValue("rec", counted == null ? null : counted.multiply(ratio).setScale(4, RoundingMode.HALF_UP))
                .addValue("uc", it.get("unit_cost")).addValue("issue", issue));
        }
        if (!rows.isEmpty()) {
            jdbc.batchUpdate(
                "insert into confere_stock_entries (market_id, document_id, check_id, item_number, product_id, gtin, description, " +
                "expected_units, received_units, unit_cost, issue) values (:m, :d, :c, :n, :pid, :gtin, :desc, :exp, :rec, :uc, :issue)",
                rows.toArray(new MapSqlParameterSource[0]));
        }
        return rows.size();
    }

    // ── Apoio ─────────────────────────────────────────────────────────────

    private static LocalDate date(String v) {
        if (v == null || v.length() < 10) {
            return null;
        }
        try {
            return LocalDate.parse(v.substring(0, 10));
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static String cut(String s, int max) {
        return s == null ? null : s.length() > max ? s.substring(0, max) : s;
    }
}
