package com.pdv2cloud.service.partner;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
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
 * O que o ERP do lojista envia: catálogo, custo, preço, estoque, entradas de
 * mercadoria e fornecedores. Cada item é validado sozinho e volta com o motivo
 * quando é recusado; {@code dryRun} valida sem gravar (homologação e testes).
 *
 * Roda com a loja do caminho no contexto (RLS): o parceiro só grava na loja
 * que o autorizou.
 */
@Service
@Profile("!jobs")
public class PartnerIngestService {

    public static final int MAX_BATCH = 1000;

    private final NamedParameterJdbcTemplate jdbc;

    public PartnerIngestService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record ItemResult(int index, String ref, String status, String error) { }

    public record BatchResult(int received, int accepted, int rejected, boolean dryRun, List<ItemResult> items) { }

    // ── Apoio ───────────────────────────────────────────────────────────────

    static String digits(Object v) {
        return v == null ? null : String.valueOf(v).replaceAll("\\D", "");
    }

    static BigDecimal decimal(Object v) {
        if (v == null || String.valueOf(v).isBlank()) return null;
        try {
            return new BigDecimal(String.valueOf(v));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("número inválido: " + v);
        }
    }

    static String text(Object v, int max) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s.length() > max ? s.substring(0, max) : s;
    }

    static boolean validGtin(String g) {
        if (g == null || !(g.length() == 8 || g.length() == 12 || g.length() == 13 || g.length() == 14)) return false;
        int sum = 0;
        for (int i = 0; i < g.length() - 1; i++) {
            int d = g.charAt(g.length() - 2 - i) - '0';
            sum += (i % 2 == 0) ? d * 3 : d;
        }
        return (10 - sum % 10) % 10 == g.charAt(g.length() - 1) - '0';
    }

    /** O mesmo GTIN com e sem zeros à esquerda (8, 12, 13 e 14 dígitos), para usar o índice de ean. */
    static List<String> gtinVariants(String gtin) {
        String bare = gtin.replaceFirst("^0+", "");
        List<String> out = new ArrayList<>();
        out.add(bare);
        for (int len : new int[] { 8, 12, 13, 14 }) {
            if (bare.length() < len) out.add("0".repeat(len - bare.length()) + bare);
        }
        return out;
    }

    /** Produto pelo GTIN, ignorando zeros à esquerda (o mesmo código em 13 ou 14 dígitos). */
    UUID productByGtin(String gtin) {
        List<UUID> found = jdbc.query("select id from products where ean in (:g) limit 1",
            new MapSqlParameterSource("g", gtinVariants(gtin)), (rs, n) -> rs.getObject("id", UUID.class));
        return found.isEmpty() ? null : found.get(0);
    }

    private interface ItemWork {
        String apply(Map<String, Object> item, boolean dryRun);
    }

    private BatchResult batch(List<Map<String, Object>> items, boolean dryRun, String refKey, ItemWork work) {
        if (items == null || items.isEmpty()) throw new IllegalArgumentException("Envie ao menos 1 item em \"items\".");
        if (items.size() > MAX_BATCH) throw new IllegalArgumentException("No máximo " + MAX_BATCH + " itens por lote.");
        List<ItemResult> out = new ArrayList<>();
        int ok = 0;
        for (int i = 0; i < items.size(); i++) {
            Map<String, Object> it = items.get(i);
            String ref = it == null ? null : text(it.get(refKey), 60);
            try {
                if (it == null) throw new IllegalArgumentException("item vazio");
                String status = work.apply(it, dryRun);
                out.add(new ItemResult(i, ref, status, null));
                ok++;
            } catch (IllegalArgumentException e) {
                out.add(new ItemResult(i, ref, "RECUSADO", e.getMessage()));
            }
        }
        return new BatchResult(items.size(), ok, items.size() - ok, dryRun, out);
    }

    private UUID requireProduct(Map<String, Object> it) {
        String gtin = digits(it.get("gtin"));
        if (!validGtin(gtin)) throw new IllegalArgumentException("gtin ausente ou inválido");
        UUID id = productByGtin(gtin);
        if (id == null) throw new IllegalArgumentException("produto não cadastrado: envie antes em /products");
        return id;
    }

    // ── Recursos ────────────────────────────────────────────────────────────

    /** Catálogo: cria o produto pelo GTIN quando ainda não existe; nunca sobrescreve o catálogo enriquecido. */
    @Transactional
    public BatchResult products(UUID marketId, List<Map<String, Object>> items, boolean dryRun) {
        return batch(items, dryRun, "gtin", (it, dry) -> {
            String gtin = digits(it.get("gtin"));
            if (!validGtin(gtin)) throw new IllegalArgumentException("gtin ausente ou inválido");
            String name = text(it.get("description"), 300);
            if (name == null) throw new IllegalArgumentException("description é obrigatório");
            UUID existing = productByGtin(gtin);
            if (dry) return existing == null ? "CRIARIA" : "JA_EXISTE";
            if (existing == null) {
                jdbc.update("insert into products (id, ean, name, category, brand, unit, created_at, source_best, identity_type) " +
                    "values (gen_random_uuid(), :g, :n, :c, :b, :u, now(), 'MANUAL', 'GTIN')",
                    new MapSqlParameterSource("g", gtin).addValue("n", name).addValue("c", text(it.get("department"), 120))
                        .addValue("b", text(it.get("brand"), 120)).addValue("u", text(it.get("unit"), 10)));
                return "CRIADO";
            }
            return "JA_EXISTE";
        });
    }

    @Transactional
    public BatchResult costs(UUID partnerId, UUID marketId, List<Map<String, Object>> items, boolean dryRun) {
        BatchResult r = batch(items, dryRun, "gtin", (it, dry) -> {
            UUID product = requireProduct(it);
            BigDecimal cost = decimal(it.get("unitCost"));
            if (cost == null || cost.signum() <= 0) throw new IllegalArgumentException("unitCost precisa ser maior que zero");
            if (dry) return "VALIDO";
            jdbc.update("insert into purchase_price_history (market_id, product_id, quantity_purchased, unit_cost, source, note, purchased_at) " +
                "values (:m, :p, 0, :c, 'ERP', 'Custo enviado pelo ERP', coalesce(:at, now()))",
                new MapSqlParameterSource("m", marketId).addValue("p", product).addValue("c", cost).addValue("at", timestamp(it.get("at"))));
            return "GRAVADO";
        });
        touch(partnerId, marketId, "last_costs_at", r);
        return r;
    }

    @Transactional
    public BatchResult prices(UUID partnerId, UUID marketId, List<Map<String, Object>> items, boolean dryRun) {
        BatchResult r = batch(items, dryRun, "gtin", (it, dry) -> {
            UUID product = requireProduct(it);
            BigDecimal price = decimal(it.get("price"));
            BigDecimal promo = decimal(it.get("promoPrice"));
            if (price == null || price.signum() <= 0) throw new IllegalArgumentException("price precisa ser maior que zero");
            if (promo != null && (promo.signum() <= 0 || promo.compareTo(price) > 0)) {
                throw new IllegalArgumentException("promoPrice precisa ser maior que zero e não maior que price");
            }
            LocalDate start = date(it.get("promoStart"));
            LocalDate end = date(it.get("promoEnd"));
            if (start != null && end != null && end.isBefore(start)) throw new IllegalArgumentException("promoEnd antes de promoStart");
            if (dry) return "VALIDO";
            jdbc.update("insert into product_price_list (market_id, product_id, price, promo_price, promo_start, promo_end, source, updated_at) " +
                "values (:m, :p, :pr, :pp, :ps, :pe, 'ERP', now()) on conflict (market_id, product_id) do update set " +
                "price = excluded.price, promo_price = excluded.promo_price, promo_start = excluded.promo_start, " +
                "promo_end = excluded.promo_end, source = 'ERP', updated_at = now()",
                new MapSqlParameterSource("m", marketId).addValue("p", product).addValue("pr", price).addValue("pp", promo)
                    .addValue("ps", start).addValue("pe", end));
            return "GRAVADO";
        });
        touch(partnerId, marketId, "last_prices_at", r);
        return r;
    }

    @Transactional
    public BatchResult stock(UUID partnerId, UUID marketId, List<Map<String, Object>> items, boolean dryRun) {
        BatchResult r = batch(items, dryRun, "gtin", (it, dry) -> {
            UUID product = requireProduct(it);
            BigDecimal units = decimal(it.get("units"));
            if (units == null || units.signum() < 0) throw new IllegalArgumentException("units é obrigatório e não pode ser negativo");
            if (dry) return "VALIDO";
            jdbc.update("insert into stock_counts (market_id, product_id, units, counted_at, source, created_by) " +
                "values (:m, :p, :u, coalesce(:at, now()), 'ERP', 'ERP')",
                new MapSqlParameterSource("m", marketId).addValue("p", product).addValue("u", units).addValue("at", timestamp(it.get("at"))));
            return "GRAVADO";
        });
        touch(partnerId, marketId, "last_stock_at", r);
        return r;
    }

    /** Entrada de mercadoria do ERP: vira entrada de estoque e custo (source ERP_RECEIPT). */
    @Transactional
    public BatchResult receipts(UUID marketId, List<Map<String, Object>> items, boolean dryRun) {
        return batch(items, dryRun, "number", (rec, dry) -> {
            String cnpj = digits(rec.get("supplierCnpj"));
            String number = text(rec.get("number"), 30);
            if (cnpj == null || cnpj.length() != 14) throw new IllegalArgumentException("supplierCnpj inválido");
            if (number == null) throw new IllegalArgumentException("number é obrigatório");
            if (!(rec.get("items") instanceof List<?> lines) || lines.isEmpty()) throw new IllegalArgumentException("items da nota é obrigatório");
            String note = "ERP NF " + cnpj + "/" + number;
            Integer seen = jdbc.queryForObject("select count(*) from purchase_price_history where market_id = :m and note = :n",
                new MapSqlParameterSource("m", marketId).addValue("n", note), Integer.class);
            List<Object[]> rows = new ArrayList<>();
            for (Object o : lines) {
                if (!(o instanceof Map<?, ?> raw)) throw new IllegalArgumentException("item da nota inválido");
                @SuppressWarnings("unchecked") Map<String, Object> line = (Map<String, Object>) raw;
                UUID product = requireProduct(line);
                BigDecimal qty = decimal(line.get("quantity"));
                BigDecimal cost = decimal(line.get("unitCost"));
                if (qty == null || qty.signum() <= 0) throw new IllegalArgumentException("quantity (em unidades de venda) precisa ser maior que zero");
                if (cost == null || cost.signum() <= 0) throw new IllegalArgumentException("unitCost precisa ser maior que zero");
                rows.add(new Object[] { product, qty, cost });
            }
            if (seen != null && seen > 0) return "JA_RECEBIDA";
            if (dry) return "VALIDO";
            Timestamp at = timestamp(rec.get("receivedAt"));
            for (Object[] row : rows) {
                jdbc.update("insert into purchase_price_history (market_id, product_id, quantity_purchased, unit_cost, supplier_name, source, note, purchased_at) " +
                    "values (:m, :p, :q, :c, :s, 'ERP_RECEIPT', :n, coalesce(:at, now()))",
                    new MapSqlParameterSource("m", marketId).addValue("p", row[0]).addValue("q", row[1]).addValue("c", row[2])
                        .addValue("s", text(rec.get("supplierName"), 255)).addValue("n", note).addValue("at", at));
            }
            return "GRAVADO";
        });
    }

    @Transactional
    public BatchResult suppliers(UUID marketId, List<Map<String, Object>> items, boolean dryRun) {
        return batch(items, dryRun, "cnpj", (it, dry) -> {
            String cnpj = digits(it.get("cnpj"));
            String name = text(it.get("legalName"), 255);
            if (cnpj == null || cnpj.length() != 14) throw new IllegalArgumentException("cnpj inválido");
            if (name == null) throw new IllegalArgumentException("legalName é obrigatório");
            if (dry) return "VALIDO";
            jdbc.update("insert into suppliers (id, market_id, cnpj, razao_social, nome_fantasia, email, telefone, created_at) " +
                "values (gen_random_uuid(), :m, :c, :r, :f, :e, :t, now()) on conflict (market_id, cnpj) do update set " +
                "razao_social = excluded.razao_social, nome_fantasia = coalesce(excluded.nome_fantasia, suppliers.nome_fantasia), " +
                "email = coalesce(excluded.email, suppliers.email), telefone = coalesce(excluded.telefone, suppliers.telefone), updated_at = now()",
                new MapSqlParameterSource("m", marketId).addValue("c", cnpj).addValue("r", name)
                    .addValue("f", text(it.get("tradeName"), 255)).addValue("e", text(it.get("email"), 255)).addValue("t", text(it.get("phone"), 30)));
            return "GRAVADO";
        });
    }

    /** Marca quando o parceiro mandou estoque/preço/custo: base da troca obrigatória. */
    private void touch(UUID partnerId, UUID marketId, String column, BatchResult r) {
        if (r.dryRun() || r.accepted() == 0) return;
        jdbc.update("update partner_market_links set " + column + " = now() where market_id = :m and partner_id = :p and status = 'ATIVO'",
            new MapSqlParameterSource("m", marketId).addValue("p", partnerId));
    }

    static Timestamp timestamp(Object v) {
        if (v == null || String.valueOf(v).isBlank()) return null;
        try {
            return Timestamp.valueOf(LocalDateTime.parse(String.valueOf(v).replace("Z", "")));
        } catch (Exception e) {
            throw new IllegalArgumentException("data/hora inválida (use AAAA-MM-DDTHH:MM:SS): " + v);
        }
    }

    static LocalDate date(Object v) {
        if (v == null || String.valueOf(v).isBlank()) return null;
        try {
            return LocalDate.parse(String.valueOf(v));
        } catch (Exception e) {
            throw new IllegalArgumentException("data inválida (use AAAA-MM-DD): " + v);
        }
    }

    public Map<String, Object> summary(BatchResult r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("received", r.received());
        m.put("accepted", r.accepted());
        m.put("rejected", r.rejected());
        m.put("dryRun", r.dryRun());
        m.put("items", r.items());
        return m;
    }

    static Map<String, Object> asMap(Object o) {
        Map<String, Object> m = new HashMap<>();
        if (o instanceof Map<?, ?> raw) raw.forEach((k, v) -> m.put(String.valueOf(k), v));
        return m;
    }
}
