package com.pdv2cloud.service.art;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;

/**
 * Texto de busca de produto como o lojista digita.
 *
 * Nome de nota e de catálogo vem em maiúsculas, abreviado e com acento
 * ("AÇÚCAR REF UNIÃO 1KG"); o lojista digita "acucar uniao". Por isso a busca
 * ignora acento e maiúsculas e exige cada palavra em qualquer ordem, não o
 * texto inteiro seguido.
 */
final class ArtSearch {

    private static final String FROM = "áàâãäåéèêëíìîïóòôõöúùûüçñý";
    private static final String TO = "aaaaaaeeeeiiiiooooouuuucny";

    private ArtSearch() {}

    /** Coluna normalizada no SQL (minúsculas e sem acento). */
    static String norm(String column) {
        return "translate(lower(coalesce(" + column + ", '')), '" + FROM + "', '" + TO + "')";
    }

    static String normalize(String text) {
        String lower = text == null ? "" : text.toLowerCase(Locale.ROOT);
        return Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
    }

    /** Até 5 palavras, sem acento, já escapadas para LIKE. */
    static List<String> words(String query) {
        List<String> out = new ArrayList<>();
        for (String w : normalize(query).split("[^a-z0-9.,]+")) {
            if (w.isBlank() || out.size() >= 5) {
                continue;
            }
            out.add("%" + w.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        return out;
    }

    /**
     * Condição "cada palavra aparece em alguma das colunas". Registra os
     * parâmetros {@code :w0..:wN} em {@code params}.
     */
    static String allWordsIn(List<String> words, List<String> columns, MapSqlParameterSource params) {
        if (words.isEmpty()) {
            return "false";
        }
        List<String> parts = new ArrayList<>();
        for (int i = 0; i < words.size(); i++) {
            String name = "w" + i;
            params.addValue(name, words.get(i));
            List<String> ors = new ArrayList<>();
            for (String c : columns) {
                ors.add(norm(c) + " like :" + name);
            }
            parts.add("(" + String.join(" or ", ors) + ")");
        }
        return String.join(" and ", parts);
    }

    /** O mesmo código de barras gravado com ou sem zeros à esquerda (GTIN-8/12/13/14). */
    static List<String> eanVariants(String digits) {
        String core = digits.replaceFirst("^0+", "");
        Set<String> out = new LinkedHashSet<>();
        out.add(digits);
        out.add(core);
        for (int len : new int[] {8, 12, 13, 14}) {
            if (core.length() <= len) {
                out.add("0".repeat(len - core.length()) + core);
            }
        }
        return new ArrayList<>(out);
    }

    /** Só dígitos (8 a 14): é código de barras, não nome. */
    static String asEan(String query) {
        String compact = query == null ? "" : query.replaceAll("\\s", "");
        return compact.matches("\\d{8,14}") ? compact : null;
    }
}
