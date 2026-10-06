package com.pdv2cloud.service.ai.agents;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Os itens de uma decisão do Copiloto, para a tela editar item a item: o
 * produto (com foto), a quantidade, o custo, o fornecedor e o motivo. E os
 * ajustes do lojista na hora de aprovar (tirar itens, mudar quantidade,
 * desconto ou preço, editar a mensagem), gravados antes de o agente executar.
 */
@Service
public class DecisionItemsService {

    public record Item(String id, String action, String name, String image, String detail, BigDecimal qty, BigDecimal suggestedQty,
                       String unit, BigDecimal unitCost, BigDecimal value, BigDecimal price, BigDecimal suggestedPrice,
                       BigDecimal discountPct, String supplier, String status, List<String> reasons,
                       String productId, String costSource) {}

    public record Items(String kind, String supplier, String reference, List<Item> items, String message) {}

    private static final Pattern MISSING = Pattern.compile("^\\s*([\\d.,]+)\\s+(\\S+)\\s+de\\s+(.+?)\\s*$", Pattern.CASE_INSENSITIVE);

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();

    public DecisionItemsService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @SuppressWarnings("unchecked")
    public Items items(UUID marketId, DecisionService.Decision d) {
        Map<String, Object> p = d.payload() == null ? Map.of() : d.payload();
        if (p.get("checkId") != null) {
            return delivery(marketId, String.valueOf(p.get("checkId")), String.valueOf(p.getOrDefault("mensagem", "")));
        }
        List<String> ids = (List<String>) p.getOrDefault("recommendationIds", List.of());
        if (!ids.isEmpty()) {
            return new Items("RECOMENDACOES", null, null, recommendations(marketId, ids), null);
        }
        return new Items("TEXTO", null, null, List.of(), null);
    }

    // ── Recomendações (compra, liquidação, promoção, preço) ─────────────

    private List<Item> recommendations(UUID marketId, List<String> ids) {
        List<UUID> uuids = ids.stream().map(UUID::fromString).toList();
        List<Map<String, Object>> rows = jdbc.queryForList("select r.id, r.action_type, r.title, r.status, r.parameters::text as params, "
                + "o.evidence::text as evidence, p.name as product_name, p.image_url, p.id as product_id "
                + "from recommendations r left join opportunities o on o.id = r.opportunity_id "
                + "left join products p on p.id = case when r.parameters->>'produtoId' ~ '^[0-9a-fA-F-]{36}$' "
                + "  then (r.parameters->>'produtoId')::uuid end "
                + "where r.market_id = :m and r.id in (:ids)",
            new MapSqlParameterSource().addValue("m", marketId).addValue("ids", uuids));
        Map<String, Map<String, Object>> byId = new LinkedHashMap<>();
        rows.forEach(r -> byId.put(String.valueOf(r.get("id")), r));
        List<Item> out = new ArrayList<>();
        for (String id : ids) {
            Map<String, Object> r = byId.get(id);
            if (r != null) {
                out.add(recommendationItem(marketId, r));
            }
        }
        return out;
    }

    private Item recommendationItem(UUID marketId, Map<String, Object> r) {
        JsonNode params = read((String) r.get("params"));
        JsonNode ev = read((String) r.get("evidence"));
        String type = String.valueOf(r.get("action_type"));
        String name = r.get("product_name") != null ? String.valueOf(r.get("product_name")) : stripVerb(String.valueOf(r.get("title")));
        String image = r.get("image_url") == null ? null : String.valueOf(r.get("image_url"));
        UUID productId = (UUID) r.get("product_id");
        Map<String, Object> last = productId == null ? Map.of() : lastPurchase(marketId, productId);
        Object[] known = productId == null ? null : knownCost(marketId, productId);
        BigDecimal knownCost = known != null ? (BigDecimal) known[0] : (BigDecimal) last.get("cost");
        String knownSource = known != null ? (String) known[1] : last.get("cost") != null ? "SUPPLIER_ORDER" : null;
        String supplier = (String) last.get("supplier");
        List<String> reasons = new ArrayList<>();
        BigDecimal giro = dec(ev, "giroDiario");
        BigDecimal cover = dec(ev, "coberturaDias");
        if (giro != null && giro.signum() > 0) {
            BigDecimal week = giro.multiply(BigDecimal.valueOf(7));
            reasons.add("vende " + (week.compareTo(BigDecimal.ONE) < 0 ? giro.setScale(2, RoundingMode.HALF_UP) + "/dia" : week.setScale(0, RoundingMode.HALF_UP) + "/semana"));
        } else if (giro != null) {
            reasons.add("sem venda no período");
        }
        String status = String.valueOf(r.get("status"));
        switch (type) {
            case "COMPRAR" -> {
                if ("reduzir_proxima_compra".equals(text(params, "acao"))) {
                    if (cover != null && cover.signum() > 0) {
                        reasons.add("estoque para " + cover.setScale(0, RoundingMode.HALF_UP) + " dias");
                    }
                    return new Item(String.valueOf(r.get("id")), "REDUZIR", name, image, "Comprar menos na próxima", null, null, "un.",
                        null, null, null, null, null, supplier, status, reasons, productId == null ? null : productId.toString(), knownSource);
                }
                BigDecimal qty = dec(params, "quantidade");
                qty = qty == null ? null : qty.setScale(0, RoundingMode.HALF_UP).max(BigDecimal.ONE);
                BigDecimal suggested = dec(params, "quantidadeSugerida") != null ? dec(params, "quantidadeSugerida") : qty;
                BigDecimal cost = knownCost;
                BigDecimal estimated = dec(params, "valorEstimado");
                if (cost == null && estimated != null && qty != null && qty.signum() > 0) {
                    BigDecimal base = dec(params, "quantidadeSugerida") != null ? dec(params, "quantidadeSugerida") : qty;
                    cost = estimated.divide(base, 2, RoundingMode.HALF_UP);
                }
                if (cover != null) {
                    reasons.add(cover.signum() <= 0 ? "sem estoque" : "estoque para " + cover.setScale(0, RoundingMode.HALF_UP) + " dias");
                }
                BigDecimal value = cost != null && qty != null ? cost.multiply(qty).setScale(2, RoundingMode.HALF_UP) : estimated;
                return new Item(String.valueOf(r.get("id")), "COMPRAR", name, image, null, qty, suggested, "un.", cost, value, null, null,
                    null, supplier, status, reasons, productId == null ? null : productId.toString(), knownSource);
            }
            case "LIQUIDAR" -> {
                BigDecimal stockValue = dec(params, "valorEstoque");
                if (stockValue != null) {
                    reasons.add("R$ " + stockValue.setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',') + " parados");
                }
                if (cover != null && cover.signum() > 0 && giro != null && giro.signum() > 0) {
                    reasons.add("estoque para " + cover.setScale(0, RoundingMode.HALF_UP) + " dias");
                }
                BigDecimal price = dec(ev, "precoAtual");
                BigDecimal suggestedPrice = dec(params, "precoLiquidacao");
                return new Item(String.valueOf(r.get("id")), "LIQUIDAR", name, image, null, null, null, "un.", knownCost, stockValue, price,
                    suggestedPrice, null, supplier, status, reasons, productId == null ? null : productId.toString(), knownSource);
            }
            case "PROMOVER" -> {
                BigDecimal price = dec(params, "precoAtual");
                BigDecimal disc = dec(params, "descontoPercent");
                BigDecimal newPrice = price != null && disc != null
                    ? price.multiply(BigDecimal.ONE.subtract(disc.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP))).setScale(2, RoundingMode.HALF_UP)
                    : null;
                BigDecimal margin = dec(ev, "margemPercent");
                if (margin != null) {
                    reasons.add("margem de " + margin.setScale(0, RoundingMode.HALF_UP) + "%");
                } else {
                    reasons.add("sem custo registrado");
                }
                BigDecimal informed = dec(params, "precoInformado");
                if (informed != null) newPrice = informed;
                return new Item(String.valueOf(r.get("id")), "PROMOVER", name, image, null, null, null, "un.", knownCost, null, price, newPrice,
                    disc, supplier, status, reasons, productId == null ? null : productId.toString(), knownSource);
            }
            case "AJUSTAR_PRECO" -> {
                BigDecimal price = dec(params, "precoAtual");
                BigDecimal ref = dec(params, "precoNovo") != null ? dec(params, "precoNovo") : dec(params, "precoReferencia");
                reasons.add("referência do mercado: R$ " + (dec(params, "precoReferencia") == null ? "—"
                    : dec(params, "precoReferencia").setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',')));
                return new Item(String.valueOf(r.get("id")), "PRECO", name, image, null, null, null, "un.", null, null, price, ref, null,
                    supplier, status, reasons, productId == null ? null : productId.toString(), knownSource);
            }
            default -> {
                return new Item(String.valueOf(r.get("id")), type, name, image, String.valueOf(r.get("title")), null, null, null, null,
                    null, null, null, null, supplier, status, reasons, productId == null ? null : productId.toString(), knownSource);
            }
        }
    }

    /** Último custo registrado (compra, NF-e, informado ou ERP) e a fonte. */
    private Object[] knownCost(UUID marketId, UUID productId) {
        List<Map<String, Object>> r = jdbc.queryForList("select unit_cost, source from purchase_price_history "
            + "where market_id = :m and product_id = :p and unit_cost > 0 order by purchased_at desc limit 1",
            Map.of("m", marketId, "p", productId));
        return r.isEmpty() ? null : new Object[] { r.get(0).get("unit_cost"), r.get(0).get("source") };
    }

    private Map<String, Object> lastPurchase(UUID marketId, UUID productId) {
        List<Map<String, Object>> r = jdbc.queryForList("select coalesce(s.nome_fantasia, s.razao_social) as supplier, i.unit_cost as cost "
            + "from supplier_order_items i join supplier_orders so on so.id = i.supplier_order_id left join suppliers s on s.id = so.supplier_id "
            + "where so.market_id = :m and i.product_id = :p order by so.created_at desc limit 1", Map.of("m", marketId, "p", productId));
        return r.isEmpty() ? Map.of() : r.get(0);
    }

    // ── Entrega conferida (Recebimento) ─────────────────────────────────

    private Items delivery(UUID marketId, String checkId, String message) {
        List<Map<String, Object>> c = jdbc.queryForList("select c.summary::text as summary, c.document_id, d.emitter_name, d.number "
            + "from confere_checks c join nfe_documents d on d.id = c.document_id where c.market_id = :m and c.id = cast(:id as uuid)",
            Map.of("m", marketId, "id", checkId));
        if (c.isEmpty()) {
            return new Items("ENTREGA", null, null, List.of(), message);
        }
        Map<String, Object> row = c.get(0);
        JsonNode s = read((String) row.get("summary"));
        List<Map<String, Object>> lines = jdbc.queryForList("select i.description, i.unit, i.quantity, i.unit_price, i.unit_cost, "
            + "p.image_url, p.name as product_name from nfe_document_items i left join products p on p.id = i.product_id "
            + "where i.document_id = :d order by i.item_number", Map.of("d", row.get("document_id")));
        List<Item> items = new ArrayList<>();
        int n = 0;
        for (String kind : List.of("falta", "sobra", "issues")) {
            for (JsonNode t : s.path(kind)) {
                String text = t.asText();
                Matcher m = MISSING.matcher(text);
                BigDecimal qty = null;
                String unit = null;
                String desc = text;
                if (m.matches() && !"issues".equals(kind)) {
                    qty = parse(m.group(1));
                    unit = m.group(2);
                    desc = m.group(3);
                }
                Map<String, Object> line = match(lines, desc);
                BigDecimal unitPrice = line == null ? null : (BigDecimal) (line.get("unit_cost") != null ? line.get("unit_cost") : line.get("unit_price"));
                BigDecimal expected = line == null ? null : (BigDecimal) line.get("quantity");
                BigDecimal value = unitPrice != null && qty != null ? unitPrice.multiply(qty).setScale(2, RoundingMode.HALF_UP) : null;
                String name = line != null && line.get("product_name") != null ? String.valueOf(line.get("product_name")) : desc;
                String detail = switch (kind) {
                    case "falta" -> "Faltou " + text.replace(" de " + desc, "");
                    case "sobra" -> "Veio a mais " + text.replace(" de " + desc, "");
                    default -> text;
                };
                items.add(new Item("item-" + (n++), "falta".equals(kind) ? "FALTA" : "sobra".equals(kind) ? "SOBRA" : "PROBLEMA", name,
                    line == null || line.get("image_url") == null ? null : String.valueOf(line.get("image_url")), detail, qty, expected,
                    unit, unitPrice, value, null, null, null, null, null,
                    expected == null || qty == null ? List.of() : List.of("veio " + expected.subtract(qty).stripTrailingZeros().toPlainString()
                        + " de " + expected.stripTrailingZeros().toPlainString() + " " + (unit == null ? "" : unit).toLowerCase()), null, null));
            }
        }
        return new Items("ENTREGA", row.get("emitter_name") == null ? null : String.valueOf(row.get("emitter_name")),
            row.get("number") == null ? null : String.valueOf(row.get("number")), items, message);
    }

    private static Map<String, Object> match(List<Map<String, Object>> lines, String desc) {
        String want = desc.trim().toLowerCase();
        for (Map<String, Object> l : lines) {
            String d = l.get("description") == null ? "" : String.valueOf(l.get("description")).trim().toLowerCase();
            if (d.equals(want) || d.contains(want) || want.contains(d) && !d.isEmpty()) {
                return l;
            }
        }
        return null;
    }

    // ── Ajustes na aprovação ────────────────────────────────────────────

    /**
     * Aplica os ajustes do lojista e devolve o payload que o agente executa.
     * Itens tirados são recusados (o Copiloto aprende com eles); quantidade,
     * desconto e preço novos ficam na própria recomendação.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> apply(UUID marketId, Map<String, Object> payload, Map<String, Object> adj, String actor,
                                     Map<String, Object> summary) {
        Map<String, Object> out = new LinkedHashMap<>(payload);
        if (adj == null || adj.isEmpty()) {
            return out;
        }
        List<String> ids = new ArrayList<>((List<String>) payload.getOrDefault("recommendationIds", List.of()));
        List<String> excluded = adj.get("excluir") instanceof List<?> l ? l.stream().map(String::valueOf).toList() : List.of();
        int removed = 0;
        for (String id : excluded) {
            if (ids.remove(id)) {
                removed += jdbc.update("update recommendations set status = 'REJEITADA', decided_by = :u, decided_at = now(), "
                    + "decision_note = 'Tirado no Copiloto' where market_id = :m and id = cast(:id as uuid) and status = 'PROPOSTA'",
                    Map.of("m", marketId, "id", id, "u", actor));
            }
        }
        int changed = 0;
        changed += setParam(marketId, ids, adj.get("quantidades"), "quantidade", "quantidadeSugerida");
        changed += setParam(marketId, ids, adj.get("descontos"), "descontoPercent", "descontoSugerido");
        changed += setParam(marketId, ids, adj.get("precos"), "precoNovo", null);
        changed += setParam(marketId, ids, adj.get("precosLiquidacao"), "precoLiquidacao", null);
        changed += setParam(marketId, ids, adj.get("precosPromocao"), "precoInformado", null);
        changed += saveCosts(marketId, ids, adj.get("custos"), actor);
        // Preço da promoção informado em R$: o desconto passa a ser derivado dele.
        if (adj.get("precosPromocao") instanceof Map<?, ?> pp && !pp.isEmpty()) {
            jdbc.update("update recommendations set parameters = parameters || jsonb_build_object('descontoPercent', "
                + "round((1 - cast(parameters->>'precoInformado' as numeric) / nullif(cast(parameters->>'precoAtual' as numeric), 0)) * 100, 1)) "
                + "where market_id = :m and id = any(cast(:ids as uuid[])) and parameters ? 'precoInformado' and parameters ? 'precoAtual'",
                new MapSqlParameterSource().addValue("m", marketId)
                    .addValue("ids", pp.keySet().stream().map(String::valueOf).filter(ids::contains)
                        .collect(java.util.stream.Collectors.joining(",", "{", "}"))));
        }
        if (payload.containsKey("recommendationIds")) {
            out.put("recommendationIds", ids);
        }
        if (adj.get("mensagem") instanceof String msg && !msg.isBlank()) {
            out.put("mensagem", msg.length() > 3000 ? msg.substring(0, 3000) : msg);
            summary.put("mensagemEditada", !msg.equals(payload.get("mensagem")));
        }
        summary.put("itensTirados", removed);
        summary.put("itensAjustados", changed);
        return out;
    }

    /** Custo informado por item: fica na recomendação e no histórico (source MANUAL). */
    private int saveCosts(UUID marketId, List<String> ids, Object values, String actor) {
        if (!(values instanceof Map<?, ?> map)) return 0;
        int n = 0;
        for (Map.Entry<?, ?> e : map.entrySet()) {
            String id = String.valueOf(e.getKey());
            if (!ids.contains(id) || !(e.getValue() instanceof Number num) || num.doubleValue() <= 0) continue;
            BigDecimal cost = new BigDecimal(num.toString());
            MapSqlParameterSource p = new MapSqlParameterSource().addValue("m", marketId).addValue("id", id).addValue("c", cost)
                .addValue("u", actor == null ? "lojista" : actor);
            n += jdbc.update("update recommendations set parameters = coalesce(parameters, '{}'::jsonb) || jsonb_build_object('custoInformado', cast(:c as numeric)) "
                + "where market_id = :m and id = cast(:id as uuid) and status = 'PROPOSTA'", p);
            jdbc.update("insert into purchase_price_history (market_id, product_id, quantity_purchased, unit_cost, source, note, purchased_at) "
                + "select r.market_id, coalesce(op.product_id, cast(r.parameters->>'produtoId' as uuid)), 0, :c, 'MANUAL', 'Informado no Copiloto por ' || :u, now() "
                + "from recommendations r join opportunities op on op.id = r.opportunity_id "
                + "where r.market_id = :m and r.id = cast(:id as uuid) and coalesce(op.product_id, cast(r.parameters->>'produtoId' as uuid)) is not null", p);
        }
        return n;
    }

    /**
     * Promover, liquidar e comprar não são aprovados às cegas: cada item precisa
     * de custo (registrado ou informado agora) e, para promover e liquidar, do
     * preço que será praticado. Devolve os nomes que faltam; vazio = pode aprovar.
     */
    @SuppressWarnings("unchecked")
    public List<String> missingInputs(UUID marketId, Map<String, Object> payload, Map<String, Object> adj) {
        List<String> ids = new ArrayList<>((List<String>) payload.getOrDefault("recommendationIds", List.of()));
        Map<String, Object> a = adj == null ? Map.of() : adj;
        if (a.get("excluir") instanceof List<?> ex) ids.removeAll(ex.stream().map(String::valueOf).toList());
        if (ids.isEmpty()) return List.of();
        Map<?, ?> costs = a.get("custos") instanceof Map<?, ?> m ? m : Map.of();
        Map<?, ?> promo = a.get("precosPromocao") instanceof Map<?, ?> m ? m : Map.of();
        Map<?, ?> clear = a.get("precosLiquidacao") instanceof Map<?, ?> m ? m : Map.of();
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select r.id::text as id, r.action_type, r.parameters->>'precoInformado' as preco_informado, "
                + "r.parameters->>'precoLiquidacao' as preco_liquidacao, r.parameters->>'acao' as acao, coalesce(p.name, r.title) as name, "
                + "(select h.unit_cost from purchase_price_history h where h.market_id = r.market_id and h.product_id = coalesce(op.product_id, cast(r.parameters->>'produtoId' as uuid)) "
                + "   and h.unit_cost > 0 order by h.purchased_at desc limit 1) as known_cost, "
                + "(select i.unit_cost from supplier_order_items i join supplier_orders so on so.id = i.supplier_order_id "
                + "   where so.market_id = r.market_id and i.product_id = coalesce(op.product_id, cast(r.parameters->>'produtoId' as uuid)) "
                + "   and i.unit_cost > 0 order by so.created_at desc limit 1) as order_cost "
                + "from recommendations r join opportunities op on op.id = r.opportunity_id left join products p on p.id = op.product_id "
                + "where r.market_id = :m and r.id = any(cast(:ids as uuid[]))",
            new MapSqlParameterSource().addValue("m", marketId)
                .addValue("ids", ids.stream().collect(java.util.stream.Collectors.joining(",", "{", "}"))));
        List<String> missing = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            String id = String.valueOf(r.get("id"));
            String action = String.valueOf(r.get("action_type"));
            if ("reduzir_proxima_compra".equals(r.get("acao")) || "AJUSTAR_PRECO".equals(action) || "INVESTIGAR".equals(action)) continue;
            boolean hasCost = costs.containsKey(id) || r.get("known_cost") != null || r.get("order_cost") != null;
            boolean hasPrice = switch (action) {
                case "PROMOVER" -> promo.containsKey(id) || r.get("preco_informado") != null;
                case "LIQUIDAR" -> clear.containsKey(id) || r.get("preco_liquidacao") != null;
                default -> true;
            };
            if (!hasCost || !hasPrice) missing.add(String.valueOf(r.get("name")));
        }
        return missing;
    }

    private int setParam(UUID marketId, List<String> ids, Object values, String key, String keepOriginalAs) {
        if (!(values instanceof Map<?, ?> map)) {
            return 0;
        }
        int n = 0;
        for (Map.Entry<?, ?> e : map.entrySet()) {
            String id = String.valueOf(e.getKey());
            if (!ids.contains(id) || !(e.getValue() instanceof Number num) || num.doubleValue() < 0) {
                continue;
            }
            String sql = "update recommendations set parameters = coalesce(parameters, '{}'::jsonb) "
                + (keepOriginalAs == null ? "" : "|| case when jsonb_exists(coalesce(parameters, '{}'::jsonb), :orig) then '{}'::jsonb else jsonb_build_object(:orig, parameters->:key) end ")
                + "|| jsonb_build_object(:key, cast(:v as numeric)) where market_id = :m and id = cast(:id as uuid) and status = 'PROPOSTA'";
            MapSqlParameterSource p = new MapSqlParameterSource().addValue("m", marketId).addValue("id", id).addValue("key", key)
                .addValue("v", new BigDecimal(num.toString()));
            if (keepOriginalAs != null) {
                p.addValue("orig", keepOriginalAs);
            }
            n += jdbc.update(sql, p);
        }
        return n;
    }

    // ── Apoio ───────────────────────────────────────────────────────────

    private JsonNode read(String s) {
        try {
            return s == null ? json.createObjectNode() : json.readTree(s);
        } catch (Exception e) {
            return json.createObjectNode();
        }
    }

    private static BigDecimal dec(JsonNode n, String f) {
        JsonNode v = n == null ? null : n.get(f);
        if (v == null || v.isNull()) {
            return null;
        }
        if (v.isNumber()) {
            return v.decimalValue();
        }
        return parse(v.asText());
    }

    private static String text(JsonNode n, String f) {
        JsonNode v = n == null ? null : n.get(f);
        return v == null || v.isNull() ? null : v.asText();
    }

    static BigDecimal parse(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            String t = s.trim();
            if (t.contains(",")) {
                t = t.replace(".", "").replace(',', '.');
            }
            return new BigDecimal(t);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String stripVerb(String title) {
        return title.replaceFirst("^(Comprar|Liquidar estoque de|Promover|Reduzir próxima compra de|Comprar [\\d.,]+ un\\. de)\\s*:?\\s*", "")
            .replaceFirst(" com [\\d.,]+% de desconto$", "");
    }
}
