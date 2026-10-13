package com.pdv2cloud.service.partner;

import com.pdv2cloud.model.dto.ProductSpecSheetDTO;
import com.pdv2cloud.service.CatalogImageUrlResolver;
import com.pdv2cloud.service.ProductSpecSheetService;
import com.pdv2cloud.service.art.ArtImageLibrary;
import com.pdv2cloud.tenancy.TenantContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Catálogo global para o parceiro da casa (Bipae), sem depender de a loja ter
 * conta no MercadoFlow: bipou ou digitou o nome, o cadastro vem pronto (nome,
 * marca, fabricante, departamento, unidade, conteúdo, NCM, imagem e ficha).
 *
 * NCM e CEST não vêm dos coletores: saem do que mais aparece nas notas (de
 * venda e de entrada) e nos cadastros que as lojas do Bipae devolvem. Só o
 * código fiscal sai, nunca preço, volume ou loja.
 */
@Service
@Profile("!jobs")
public class PartnerCatalogService {

    public static final int MAX_LOOKUP = 200;
    public static final int MAX_SEARCH = 50;
    public static final int MAX_CONTRIBUTIONS = 500;

    private static final String FROM = "áàâãäåéèêëíìîïóòôõöúùûüçñý";
    private static final String TO = "aaaaaaeeeeiiiiooooouuuucny";
    /** "500g", "1,5 kg", "2L", "12 x 350ml": o conteúdo da embalagem pelo nome. */
    private static final Pattern CONTENT = Pattern.compile(
        "(?:(\\d+)\\s*[xX]\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(kg|g|gr|mg|ml|l|lt|litros?|un|unid|unidades)\\b", Pattern.CASE_INSENSITIVE);

    private final NamedParameterJdbcTemplate jdbc;
    private final ProductSpecSheetService specs;
    private final ArtImageLibrary genericImages;
    private final CatalogImageUrlResolver imageUrls;
    private final String publicBaseUrl;

    public PartnerCatalogService(NamedParameterJdbcTemplate jdbc, ProductSpecSheetService specs, ArtImageLibrary genericImages,
                                 CatalogImageUrlResolver imageUrls,
                                 @Value("${app.public-base-url:https://mercadoflow.com}") String publicBaseUrl) {
        this.jdbc = jdbc;
        this.specs = specs;
        this.genericImages = genericImages;
        this.imageUrls = imageUrls;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
    }

    // ── Apoio ───────────────────────────────────────────────────────────────

    static String normalize(String text) {
        String lower = text == null ? "" : text.toLowerCase(Locale.ROOT);
        return Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
    }

    /** Até 6 palavras, sem acento, escapadas para LIKE. */
    static List<String> words(String query) {
        List<String> out = new ArrayList<>();
        for (String w : normalize(query).split("[^a-z0-9.,]+")) {
            if (w.isBlank() || out.size() >= 6) continue;
            out.add("%" + w.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        return out;
    }

    /** UN, KG, L, ... no padrão do cadastro fiscal. */
    static String unit(String raw) {
        String u = normalize(raw).replaceAll("[^a-z]", "");
        if (u.isEmpty()) return null;
        return switch (u) {
            case "un", "und", "unid", "unidade", "pc", "peca", "pct", "pacote" -> "UN";
            case "cx", "caixa" -> "CX";
            case "kg", "quilo", "kilo", "quilograma" -> "KG";
            case "g", "gr", "grama" -> "G";
            case "l", "lt", "litro" -> "L";
            case "ml" -> "ML";
            default -> u.length() <= 6 ? u.toUpperCase(Locale.ROOT) : null;
        };
    }

    /** Conteúdo da embalagem: {quantity, unit, packs} ou null. */
    static Map<String, Object> content(String name) {
        if (name == null) return null;
        Matcher m = CONTENT.matcher(name);
        Map<String, Object> found = null;
        while (m.find()) {
            String u = normalize(m.group(3));
            String unit = u.startsWith("k") ? "KG" : u.equals("mg") ? "MG" : u.startsWith("g") ? "G" : u.startsWith("m") ? "ML"
                : u.startsWith("l") ? "L" : "UN";
            BigDecimal qty;
            try {
                qty = new BigDecimal(m.group(2).replace(',', '.'));
            } catch (NumberFormatException e) {
                continue;
            }
            if (qty.signum() <= 0) continue;
            found = new LinkedHashMap<>();
            found.put("quantity", qty.stripTrailingZeros().toPlainString());
            found.put("unit", unit);
            found.put("packs", m.group(1) == null ? 1 : Integer.parseInt(m.group(1)));
            // Fica com a última medida: "Leite 1L Caixa 12un" quer a embalagem, não a contagem.
            if (!"UN".equals(unit)) break;
        }
        return found;
    }

    private String absolute(String url) {
        return url == null ? null : url.startsWith("http") ? url : publicBaseUrl + url;
    }

    private String image(String productUrl, String storageKey, String enrichmentUrl) {
        if (productUrl != null && !productUrl.isBlank()) return productUrl;
        String managed = imageUrls.managedUrl(storageKey);
        return managed != null ? managed : enrichmentUrl;
    }

    private static List<String> department(String category) {
        if (category == null || category.isBlank()) return List.of();
        List<String> out = new ArrayList<>();
        for (String part : category.split("\\s*>\\s*")) {
            if (!part.isBlank()) out.add(part.trim());
        }
        return out;
    }

    // ── Por código de barras ────────────────────────────────────────────────

    /** Um código: cadastro completo, com a ficha técnica. */
    public Map<String, Object> product(String rawGtin) {
        return lookup(List.of(rawGtin), true).get(0);
    }

    /**
     * Vários códigos de uma vez (importação de planilha, nota de entrada).
     * Sem a ficha técnica por padrão: ela é o que mais pesa.
     */
    public List<Map<String, Object>> lookup(List<String> rawGtins, boolean withSpec) {
        List<String> gtins = new ArrayList<>();
        for (String g : rawGtins) {
            String d = PartnerIngestService.digits(g);
            if (d != null && !d.isEmpty() && !gtins.contains(d)) gtins.add(d);
        }
        if (gtins.isEmpty()) throw new IllegalArgumentException("Envie ao menos 1 código de barras.");
        if (gtins.size() > MAX_LOOKUP) throw new IllegalArgumentException("No máximo " + MAX_LOOKUP + " códigos por consulta.");
        Map<String, String> variantToGtin = new HashMap<>();
        for (String g : gtins) {
            if (PartnerIngestService.validGtin(g)) PartnerIngestService.gtinVariants(g).forEach(v -> variantToGtin.putIfAbsent(v, g));
        }
        Map<String, Map<String, Object>> rows = new HashMap<>();
        if (!variantToGtin.isEmpty()) {
            TenantContext.runAsSystem(() -> {
                jdbc.queryForList(
                    "select p.id, p.ean, p.name, p.brand, p.category, p.unit, p.package_description, p.image_url, " +
                    "  pe.canonical_name, pe.brand as e_brand, pe.manufacturer, pe.category as e_category, pe.unit as e_unit, " +
                    "  pe.package_description as e_package, pe.image_storage_key, pe.image_url as e_image, pe.provider, " +
                    "  coalesce(pe.fetched_at, p.created_at) as updated_at " +
                    "from products p left join product_enrichments pe on pe.product_id = p.id where p.ean in (:g)",
                    new MapSqlParameterSource("g", variantToGtin.keySet()))
                    .forEach(r -> rows.putIfAbsent(variantToGtin.get(String.valueOf(r.get("ean"))), r));
                return null;
            });
        }
        Map<String, Map<String, Object>> fiscal = fiscal(rows);
        Map<String, List<Map<String, Object>>> packs = packs(new ArrayList<>(variantToGtin.keySet()), variantToGtin);
        Map<String, Map<String, Object>> contributed = contributions(gtins);
        List<Map<String, Object>> out = new ArrayList<>();
        for (String g : gtins) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("gtin", g);
            if (!PartnerIngestService.validGtin(g)) {
                m.put("found", false);
                m.put("reason", "GTIN_INVALIDO");
                out.add(m);
                continue;
            }
            Map<String, Object> r = rows.get(g);
            Map<String, Object> c = contributed.get(g);
            if (r == null && c == null) {
                m.put("found", false);
                m.put("reason", "NAO_ENCONTRADO");
                out.add(m);
                continue;
            }
            m.put("found", true);
            if (r != null) {
                fill(m, r);
            } else {
                // Só as lojas do Bipae conhecem: o cadastro que mais lojas usam.
                m.put("description", c.get("description"));
                m.put("brand", c.get("brand"));
                m.put("manufacturer", null);
                List<String> dep = department((String) c.get("department"));
                m.put("department", dep.isEmpty() ? null : dep.get(0));
                m.put("category", dep.size() > 1 ? String.join(" > ", dep.subList(1, dep.size())) : null);
                m.put("unit", unit((String) c.get("unit")));
                m.put("weighable", "KG".equals(m.get("unit")));
                m.put("packageDescription", c.get("package_description"));
                m.put("content", content((String) c.get("description")));
                m.put("imageUrl", null);
                m.put("imagePath", null);
                m.put("source", "LOJAS_BIPAE");
                m.put("updatedAt", c.get("updated_at"));
            }
            Map<String, Object> f = fiscal.getOrDefault(g, Map.of());
            m.put("ncm", f.get("ncm"));
            m.put("ncmConfidence", f.get("ncmConfidence"));
            m.put("cest", f.get("cest"));
            m.put("packs", packs.getOrDefault(g, List.of()));
            if (withSpec && r != null) m.put("spec", spec((UUID) r.get("id")));
            out.add(m);
        }
        return out;
    }

    private void fill(Map<String, Object> m, Map<String, Object> r) {
        String name = (String) r.get("canonical_name");
        if (name == null || name.isBlank()) name = (String) r.get("name");
        String category = r.get("e_category") != null ? (String) r.get("e_category") : (String) r.get("category");
        List<String> dep = department(category);
        String unit = unit(r.get("e_unit") != null ? (String) r.get("e_unit") : (String) r.get("unit"));
        String pkg = r.get("e_package") != null ? (String) r.get("e_package") : (String) r.get("package_description");
        // "un" no campo de embalagem não diz nada; a embalagem real está no nome.
        if (pkg != null && unit(pkg) != null && pkg.trim().length() <= 4) pkg = null;
        Map<String, Object> content = content(name);
        String brand = r.get("e_brand") != null ? (String) r.get("e_brand") : (String) r.get("brand");
        String img = image((String) r.get("image_url"), (String) r.get("image_storage_key"), (String) r.get("e_image"));
        m.put("description", name);
        m.put("brand", brand);
        m.put("manufacturer", r.get("manufacturer"));
        m.put("department", dep.isEmpty() ? null : dep.get(0));
        m.put("category", dep.size() > 1 ? String.join(" > ", dep.subList(1, dep.size())) : null);
        m.put("unit", unit == null ? "UN" : unit);
        m.put("weighable", "KG".equals(unit));
        m.put("packageDescription", pkg);
        m.put("content", content);
        m.put("imageUrl", absolute(img));
        m.put("imagePath", img != null && img.startsWith("/") ? img : null);
        m.put("source", r.get("provider"));
        m.put("updatedAt", r.get("updated_at"));
    }

    private Map<String, Object> spec(UUID productId) {
        try {
            ProductSpecSheetDTO s = TenantContext.runAsSystem(() -> specs.buildForProduct(productId));
            if (s == null || !s.isHasContent()) return null;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("description", s.getDescription());
            out.put("ingredients", s.getIngredients());
            out.put("nutritionTableHtml", s.getNutritionTableHtml());
            out.put("attributes", s.getAttributes());
            return out;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * NCM e CEST mais usados: notas de venda e de entrada de todas as lojas, mais
     * os cadastros devolvidos pelo Bipae. A confiança é a fatia dos votos.
     */
    private Map<String, Map<String, Object>> fiscal(Map<String, Map<String, Object>> rows) {
        Map<String, Map<String, Integer>> ncmVotes = new HashMap<>();
        Map<String, Map<String, Integer>> cestVotes = new HashMap<>();
        Map<UUID, String> byProduct = new HashMap<>();
        rows.forEach((g, r) -> byProduct.put((UUID) r.get("id"), g));
        TenantContext.runAsSystem(() -> {
            if (!byProduct.isEmpty()) {
                MapSqlParameterSource p = new MapSqlParameterSource("ids", byProduct.keySet());
                jdbc.queryForList(
                    "select product_id, ncm, count(*) as n from invoice_items where product_id in (:ids) and ncm ~ '^[0-9]{8}$' " +
                    "group by 1, 2 union all " +
                    "select product_id, ncm, count(*) from nfe_document_items where product_id in (:ids) and ncm ~ '^[0-9]{8}$' group by 1, 2", p)
                    .forEach(r -> ncmVotes.computeIfAbsent(byProduct.get((UUID) r.get("product_id")), k -> new HashMap<>())
                        .merge((String) r.get("ncm"), ((Number) r.get("n")).intValue(), Integer::sum));
            }
            List<String> gtins = new ArrayList<>(rows.keySet());
            if (!gtins.isEmpty()) {
                jdbc.queryForList("select gtin, ncm, cest from catalog_contributions where gtin in (:g)", new MapSqlParameterSource("g", gtins))
                    .forEach(r -> {
                        String g = (String) r.get("gtin");
                        if (r.get("ncm") != null) ncmVotes.computeIfAbsent(g, k -> new HashMap<>()).merge((String) r.get("ncm"), 1, Integer::sum);
                        if (r.get("cest") != null) cestVotes.computeIfAbsent(g, k -> new HashMap<>()).merge((String) r.get("cest"), 1, Integer::sum);
                    });
            }
            return null;
        });
        Map<String, Map<String, Object>> out = new HashMap<>();
        java.util.Set<String> keys = new java.util.HashSet<>(ncmVotes.keySet());
        keys.addAll(cestVotes.keySet());
        for (String g : keys) {
            Map<String, Object> f = new HashMap<>();
            Map.Entry<String, Integer> ncm = top(ncmVotes.get(g));
            if (ncm != null) {
                f.put("ncm", ncm.getKey());
                int total = ncmVotes.get(g).values().stream().mapToInt(Integer::intValue).sum();
                f.put("ncmConfidence", BigDecimal.valueOf(ncm.getValue()).divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP));
            }
            Map.Entry<String, Integer> cest = top(cestVotes.get(g));
            if (cest != null) f.put("cest", cest.getKey());
            out.put(g, f);
        }
        return out;
    }

    private static Map.Entry<String, Integer> top(Map<String, Integer> votes) {
        if (votes == null || votes.isEmpty()) return null;
        return votes.entrySet().stream().max(Map.Entry.<String, Integer>comparingByValue().thenComparing(Map.Entry.comparingByKey()))
            .orElse(null);
    }

    /** Caixa e fardo vistos nas notas de entrada: GTIN da embalagem e quantas unidades leva. */
    private Map<String, List<Map<String, Object>>> packs(List<String> variants, Map<String, String> variantToGtin) {
        Map<String, List<Map<String, Object>>> out = new HashMap<>();
        if (variants.isEmpty()) return out;
        TenantContext.runAsSystem(() -> {
            jdbc.queryForList(
                "select gtin, box_gtin, round(tax_quantity / nullif(quantity, 0), 3) as per_pack, count(*) as n from nfe_document_items " +
                "where gtin in (:g) and box_gtin is not null and box_gtin <> gtin and quantity > 0 and tax_quantity > quantity " +
                "group by 1, 2, 3 order by n desc", new MapSqlParameterSource("g", variants))
                .forEach(r -> {
                    String g = variantToGtin.get((String) r.get("gtin"));
                    List<Map<String, Object>> list = out.computeIfAbsent(g, k -> new ArrayList<>());
                    if (list.stream().noneMatch(x -> x.get("packGtin").equals(r.get("box_gtin")))) {
                        Map<String, Object> p = new LinkedHashMap<>();
                        p.put("packGtin", r.get("box_gtin"));
                        p.put("unitsPerPack", ((BigDecimal) r.get("per_pack")).stripTrailingZeros());
                        list.add(p);
                    }
                });
            return null;
        });
        return out;
    }

    /** O cadastro que mais lojas do Bipae usam, para o GTIN que o catálogo não tem. */
    private Map<String, Map<String, Object>> contributions(List<String> gtins) {
        Map<String, Map<String, Object>> out = new HashMap<>();
        TenantContext.runAsSystem(() -> {
            jdbc.queryForList(
                "select distinct on (gtin) gtin, description, brand, department, unit, package_description, max(updated_at) as updated_at, " +
                "  count(*) as stores from catalog_contributions where gtin in (:g) and description is not null " +
                "group by gtin, description, brand, department, unit, package_description order by gtin, stores desc, updated_at desc",
                new MapSqlParameterSource("g", gtins))
                .forEach(r -> out.put((String) r.get("gtin"), r));
            return null;
        });
        return out;
    }

    // ── Por nome ────────────────────────────────────────────────────────────

    /**
     * Busca como o operador digita ("acucar uniao 1kg"): cada palavra em
     * qualquer ordem, sem acento. Só dígitos é código de barras. Junto, as fotos
     * genéricas (frutas, carnes, padaria) para o produto de balança.
     */
    public Map<String, Object> search(String query, int limit) {
        String q = query == null ? "" : query.trim();
        if (q.length() < 2) throw new IllegalArgumentException("Digite ao menos 2 letras.");
        int size = Math.max(1, Math.min(limit, MAX_SEARCH));
        String compact = q.replaceAll("\\s", "");
        Map<String, Object> res = new LinkedHashMap<>();
        if (compact.matches("\\d{8,14}")) {
            Map<String, Object> one = lookup(List.of(compact), false).get(0);
            res.put("items", Boolean.TRUE.equals(one.get("found")) ? List.of(one) : List.of());
            res.put("genericImages", List.of());
            return res;
        }
        List<String> ws = words(q);
        MapSqlParameterSource p = new MapSqlParameterSource("limit", size);
        List<String> conds = new ArrayList<>();
        for (int i = 0; i < ws.size(); i++) {
            conds.add("p.search_text like :w" + i);
            p.addValue("w" + i, ws.get(i));
        }
        if (conds.isEmpty()) throw new IllegalArgumentException("Digite o nome do produto.");
        p.addValue("prefix", normalize(q).replaceAll("[^a-z0-9 ]", " ").trim().replaceAll("\\s+", " ") + "%");
        List<Map<String, Object>> rows = TenantContext.runAsSystem(() -> jdbc.queryForList(
            "with hits as ( " +
            "  select p.id, p.ean from products p where " + String.join(" and ", conds) + " and p.ean ~ '^[0-9]{8,14}$' " +
            "  order by (p.search_text like :prefix) desc, (p.image_url is null), length(p.name) limit :limit " +
            ") select p.id, p.ean, p.name, p.brand, p.category, p.unit, p.package_description, p.image_url, " +
            "  pe.canonical_name, pe.brand as e_brand, pe.manufacturer, pe.category as e_category, pe.unit as e_unit, " +
            "  pe.package_description as e_package, pe.image_storage_key, pe.image_url as e_image, pe.provider, " +
            "  coalesce(pe.fetched_at, p.created_at) as updated_at, (p.search_text like :prefix) as starts " +
            "from hits h join products p on p.id = h.id left join product_enrichments pe on pe.product_id = p.id " +
            "order by starts desc, (p.image_url is null), length(p.name)", p));
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("gtin", r.get("ean"));
            m.put("found", true);
            fill(m, r);
            items.add(m);
        }
        res.put("items", items);
        List<Map<String, Object>> generic = new ArrayList<>();
        for (ArtImageLibrary.LibraryImage img : genericImages.search(q, null, 6)) {
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("name", img.name());
            g.put("group", img.group());
            g.put("category", img.category());
            g.put("imageUrl", absolute(img.imageUrl()));
            g.put("imagePath", img.imageUrl());
            generic.add(g);
        }
        res.put("genericImages", generic);
        return res;
    }

    /** Fotos genéricas (frutas, verduras, carnes, padaria, frios) para o produto sem código de barras. */
    public List<Map<String, Object>> genericImages(String query, String group, int limit) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (ArtImageLibrary.LibraryImage img : genericImages.search(query == null ? "" : query, group, Math.min(Math.max(limit, 1), 60))) {
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("name", img.name());
            g.put("group", img.group());
            g.put("category", img.category());
            g.put("imageUrl", absolute(img.imageUrl()));
            g.put("imagePath", img.imageUrl());
            out.add(g);
        }
        return out;
    }

    // ── O que as lojas do Bipae cadastram ───────────────────────────────────

    /**
     * Cadastros das lojas do Bipae. Produto que o catálogo não tinha passa a
     * existir (sem foto, até um coletor achar); NCM e CEST entram como votos.
     * A loja chega só como hash: daqui não dá para saber quem cadastrou.
     */
    public PartnerIngestService.BatchResult contribute(UUID partnerId, List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) throw new IllegalArgumentException("Envie ao menos 1 item em \"items\".");
        if (items.size() > MAX_CONTRIBUTIONS) throw new IllegalArgumentException("No máximo " + MAX_CONTRIBUTIONS + " itens por lote.");
        List<PartnerIngestService.ItemResult> out = new ArrayList<>();
        int ok = 0;
        for (int i = 0; i < items.size(); i++) {
            Map<String, Object> it = items.get(i);
            String gtin = it == null ? null : PartnerIngestService.digits(it.get("gtin"));
            try {
                if (it == null) throw new IllegalArgumentException("item vazio");
                if (!PartnerIngestService.validGtin(gtin)) throw new IllegalArgumentException("gtin ausente ou inválido");
                String store = PartnerIngestService.text(it.get("storeId"), 120);
                if (store == null) throw new IllegalArgumentException("storeId é obrigatório (o id da loja no Bipae)");
                String description = PartnerIngestService.text(it.get("description"), 300);
                if (description == null) throw new IllegalArgumentException("description é obrigatório");
                String ncm = PartnerIngestService.digits(it.get("ncm"));
                if (ncm != null && !ncm.isEmpty() && ncm.length() != 8) throw new IllegalArgumentException("ncm precisa ter 8 dígitos");
                String cest = PartnerIngestService.digits(it.get("cest"));
                if (cest != null && !cest.isEmpty() && cest.length() != 7) throw new IllegalArgumentException("cest precisa ter 7 dígitos");
                String storeRef = PartnerAuthService.sha256(partnerId + ":" + store);
                MapSqlParameterSource p = new MapSqlParameterSource("p", partnerId).addValue("g", gtin).addValue("s", storeRef)
                    .addValue("d", description).addValue("b", PartnerIngestService.text(it.get("brand"), 120))
                    .addValue("dep", PartnerIngestService.text(it.get("department"), 200))
                    .addValue("u", PartnerIngestService.text(it.get("unit"), 10))
                    .addValue("pk", PartnerIngestService.text(it.get("packageDescription"), 120))
                    .addValue("n", ncm == null || ncm.isEmpty() ? null : ncm).addValue("c", cest == null || cest.isEmpty() ? null : cest);
                boolean created = TenantContext.runAsSystem(() -> {
                    jdbc.update(
                        "insert into catalog_contributions (partner_id, gtin, store_ref, description, brand, department, unit, package_description, ncm, cest) " +
                        "values (:p, :g, :s, :d, :b, :dep, :u, :pk, :n, :c) on conflict (partner_id, gtin, store_ref) do update set " +
                        "description = excluded.description, brand = excluded.brand, department = excluded.department, unit = excluded.unit, " +
                        "package_description = excluded.package_description, ncm = excluded.ncm, cest = excluded.cest, updated_at = now()", p);
                    List<String> variants = PartnerIngestService.gtinVariants(gtin);
                    Integer known = jdbc.queryForObject("select count(*) from products where ean in (:v)",
                        new MapSqlParameterSource("v", variants), Integer.class);
                    if (known != null && known > 0) return false;
                    jdbc.update("insert into products (id, ean, name, category, brand, unit, package_description, created_at, source_best, identity_type) " +
                        "values (gen_random_uuid(), :g, :d, :dep, :b, :u, :pk, now(), 'MANUAL', 'GTIN') on conflict (ean) do nothing", p);
                    return true;
                });
                out.add(new PartnerIngestService.ItemResult(i, gtin, created ? "CRIADO" : "REGISTRADO", null));
                ok++;
            } catch (IllegalArgumentException e) {
                out.add(new PartnerIngestService.ItemResult(i, gtin, "RECUSADO", e.getMessage()));
            }
        }
        return new PartnerIngestService.BatchResult(items.size(), ok, items.size() - ok, false, out);
    }
}
