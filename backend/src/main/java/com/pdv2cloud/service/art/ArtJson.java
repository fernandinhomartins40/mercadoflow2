package com.pdv2cloud.service.art;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;

/** JSONB de ida e volta sem entidade JPA. */
final class ArtJson {

    static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();

    private ArtJson() {}

    static String write(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalArgumentException("Conteúdo inválido");
        }
    }

    static Map<String, Object> map(String json) {
        if (json == null || json.isBlank()) {
            return new java.util.LinkedHashMap<>();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return new java.util.LinkedHashMap<>();
        }
    }

    static List<Object> list(String json) {
        if (json == null || json.isBlank()) {
            return new java.util.ArrayList<>();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<List<Object>>() {});
        } catch (Exception e) {
            return new java.util.ArrayList<>();
        }
    }

    static double num(Object value, double fallback) {
        if (value instanceof Number n) {
            double d = n.doubleValue();
            return Double.isFinite(d) ? d : fallback;
        }
        if (value instanceof String s) {
            try {
                return Double.parseDouble(s.replace(',', '.'));
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    static String str(Object value, int max) {
        if (value == null) {
            return null;
        }
        String s = String.valueOf(value).trim();
        if (s.isEmpty()) {
            return null;
        }
        return s.length() > max ? s.substring(0, max) : s;
    }
}
