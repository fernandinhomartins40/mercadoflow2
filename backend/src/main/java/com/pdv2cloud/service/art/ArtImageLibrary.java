package com.pdv2cloud.service.art;

import com.pdv2cloud.service.CatalogImageUrlResolver;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Banco de imagens genéricas do encarte: fotos recortadas (sem fundo) de frescos,
 * que não têm código de barras de fabricante e por isso não vêm do catálogo.
 */
@Service
public class ArtImageLibrary {

    public record LibraryImage(UUID id, String name, String group, String category, String imageUrl, Integer width,
                               Integer height) {}

    private static final Set<String> GROUPS = Set.of("hortifruti", "carnes", "padaria", "frios", "outros");
    /** Palavras da descrição da nota que não descrevem o produto ("BANANA PRATA KG" → banana prata). */
    private static final Set<String> NOISE = Set.of(
        "kg", "g", "gr", "un", "und", "unid", "unidade", "pc", "pct", "pacote", "bdj", "bandeja", "granel",
        "de", "da", "do", "com", "e", "em", "a", "o", "tipo", "resf", "resfriado", "resfriada", "cong");

    private final NamedParameterJdbcTemplate jdbc;
    private final CatalogImageUrlResolver imageUrls;

    public ArtImageLibrary(NamedParameterJdbcTemplate jdbc, CatalogImageUrlResolver imageUrls) {
        this.jdbc = jdbc;
        this.imageUrls = imageUrls;
    }

    /**
     * Busca por palavras, em qualquer ordem e sem acento. Quem busca costuma colar a
     * descrição da nota ("CARNE BOV ALCATRA KG 1,2"): unidades e números saem, e se
     * todas as palavras juntas não acham nada, tenta com menos palavras até achar.
     */
    @Transactional(readOnly = true)
    public List<LibraryImage> search(String query, String group, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 120));
        String safeGroup = group != null && GROUPS.contains(group) ? group : null;
        List<String> words = meaningfulWords(query);
        if (words.isEmpty()) {
            return run(List.of(), safeGroup, safeLimit);
        }
        for (int size = words.size(); size >= 1; size--) {
            List<LibraryImage> hits = run(words.subList(0, size), safeGroup, safeLimit);
            if (!hits.isEmpty()) {
                return hits;
            }
        }
        // Nenhuma palavra do começo serviu ("CARNE BOV ALCATRA"): tenta cada uma sozinha.
        for (String word : words) {
            List<LibraryImage> hits = run(List.of(word), safeGroup, safeLimit);
            if (!hits.isEmpty()) {
                return hits;
            }
        }
        return List.of();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> summary() {
        return jdbc.queryForMap(
            "select count(*) as total, count(*) filter (where group_name = 'hortifruti') as hortifruti, "
                + "count(*) filter (where group_name = 'carnes') as carnes, "
                + "count(*) filter (where group_name = 'padaria') as padaria, "
                + "count(*) filter (where group_name = 'frios') as frios from generic_images",
            new MapSqlParameterSource());
    }

    /** Carga do índice gerado por generic_library_build.py; repetir a carga só atualiza. */
    @Transactional
    public int importItems(List<Map<String, Object>> items) {
        int saved = 0;
        for (Map<String, Object> item : items == null ? List.<Map<String, Object>>of() : items) {
            String key = text(item.get("storageKey"));
            String name = text(item.get("name"));
            if (key == null || name == null || !key.matches("^library/[a-z0-9-]+\\.(webp|png)$")) {
                continue;
            }
            String group = text(item.get("group"));
            String category = text(item.get("category"));
            saved += jdbc.update(
                "insert into generic_images (name, group_name, category, search_text, storage_key, source_store, width, height) "
                    + "values (:name, :group, :category, :search, :key, :store, :width, :height) "
                    + "on conflict (storage_key) do update set name = excluded.name, group_name = excluded.group_name, "
                    + "category = excluded.category, search_text = excluded.search_text, source_store = excluded.source_store, "
                    + "width = excluded.width, height = excluded.height",
                new MapSqlParameterSource()
                    .addValue("name", name)
                    .addValue("group", group != null && GROUPS.contains(group) ? group : "outros")
                    .addValue("category", category)
                    .addValue("search", ArtSearch.normalize(name + " " + (category == null ? "" : category)))
                    .addValue("key", key)
                    .addValue("store", text(item.get("store")))
                    .addValue("width", number(item.get("width")))
                    .addValue("height", number(item.get("height"))));
        }
        return saved;
    }

    private List<LibraryImage> run(List<String> words, String group, int limit) {
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("limit", limit);
        List<String> conditions = new ArrayList<>();
        for (int i = 0; i < words.size(); i++) {
            // search_text já está sem acento; a palavra precisa começar um termo ("uva" não acha "chuva").
            conditions.add("(' ' || search_text) like :w" + i);
            params.addValue("w" + i, "% " + words.get(i).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        if (group != null) {
            conditions.add("group_name = :group");
            params.addValue("group", group);
        }
        String where = conditions.isEmpty() ? "" : "where " + String.join(" and ", conditions) + " ";
        // Nome que começa pelo que foi digitado e nome curto primeiro: "Banana Prata" antes de "Bolo de Banana".
        String order = words.isEmpty()
            ? "order by group_name, name "
            : "order by (" + ArtSearch.norm("name") + " like :prefix) desc, length(name), name ";
        if (!words.isEmpty()) {
            params.addValue("prefix", words.get(0) + "%");
        }
        return jdbc.query(
            "select id, name, group_name, category, storage_key, width, height from generic_images " + where + order + "limit :limit",
            params,
            (rs, i) -> new LibraryImage(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("group_name"), rs.getString("category"),
                imageUrls.managedUrl(rs.getString("storage_key")), (Integer) rs.getObject("width"), (Integer) rs.getObject("height")));
    }

    private static List<String> meaningfulWords(String query) {
        List<String> out = new ArrayList<>();
        for (String word : ArtSearch.normalize(query).split("[^a-z0-9]+")) {
            if (word.length() < 2 || NOISE.contains(word) || word.matches("\\d+[a-z]{0,3}") || out.size() >= 4) {
                continue;
            }
            out.add(word);
        }
        return out;
    }

    private static String text(Object value) {
        String text = value == null ? null : value.toString().trim();
        return text == null || text.isBlank() ? null : text;
    }

    private static Integer number(Object value) {
        return value instanceof Number n ? n.intValue() : null;
    }
}
