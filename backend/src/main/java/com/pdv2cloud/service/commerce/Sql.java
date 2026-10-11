package com.pdv2cloud.service.commerce;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Array;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** Conversões pequenas usadas por todo o módulo de vendas. */
final class Sql {

    private Sql() {
    }

    static String text(Object v, int max) {
        if (v == null || String.valueOf(v).isBlank()) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    static String digits(Object v) {
        return v == null ? "" : String.valueOf(v).replaceAll("\\D", "");
    }

    static List<String> strings(Object v) {
        if (v == null) {
            return List.of();
        }
        if (v instanceof List<?> l) {
            return l.stream().filter(x -> x != null && !String.valueOf(x).isBlank()).map(x -> String.valueOf(x).trim()).toList();
        }
        return Arrays.stream(String.valueOf(v).split("[,;\\n]")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    /** UFs em maiúsculas, validadas. */
    static List<String> ufs(Object v) {
        List<String> out = strings(v).stream().map(s -> s.toUpperCase(Locale.ROOT)).distinct().toList();
        for (String uf : out) {
            if (!uf.matches("[A-Z]{2}")) {
                throw new IllegalArgumentException("UF inválida: " + uf);
            }
        }
        return out;
    }

    /** Códigos IBGE de município (7 dígitos). */
    static List<String> cities(Object v) {
        List<String> out = new ArrayList<>();
        for (String s : strings(v)) {
            String d = digits(s);
            if (d.length() != 7) {
                throw new IllegalArgumentException("Código IBGE da cidade tem 7 dígitos: " + s);
            }
            if (!out.contains(d)) {
                out.add(d);
            }
        }
        return out;
    }

    /**
     * GTIN na forma canônica do MercadoFlow (a mesma do agregador da indústria):
     * sem zeros à esquerda e completado até 13 dígitos. Recusa código de
     * circulação restrita (prefixo 2), que é interno de cada loja.
     */
    static String gtin(Object v) {
        String d = digits(v);
        if (!d.matches("([0-9]{8}|[0-9]{12,14})")) {
            throw new IllegalArgumentException("Código de barras inválido: " + v);
        }
        String core = d.replaceFirst("^0+", "");
        if (core.isEmpty() || core.startsWith("2")) {
            throw new IllegalArgumentException("Código de barras de uso interno da loja não pode ser vendido: " + v);
        }
        return core.length() <= 13 ? "0".repeat(13 - core.length()) + core : core;
    }

    /** Expressão SQL que canoniza uma coluna de GTIN do mesmo jeito que {@link #gtin}. */
    static String canon(String column) {
        return "(case when length(ltrim(" + column + ", '0')) <= 13 then lpad(ltrim(" + column + ", '0'), 13, '0') else ltrim("
            + column + ", '0') end)";
    }

    static String cnpj(Object v) {
        String d = digits(v);
        if (d.length() != 14) {
            throw new IllegalArgumentException("Informe o CNPJ com 14 dígitos.");
        }
        return d;
    }

    static BigDecimal money(Object v, String what) {
        if (v == null || String.valueOf(v).isBlank()) {
            throw new IllegalArgumentException("Informe " + what + ".");
        }
        try {
            BigDecimal n = v instanceof BigDecimal b ? b : new BigDecimal(String.valueOf(v).trim().replace(',', '.'));
            if (n.signum() <= 0) {
                throw new IllegalArgumentException(what.substring(0, 1).toUpperCase(Locale.ROOT) + what.substring(1) + " precisa ser maior que zero.");
            }
            return n.setScale(4, RoundingMode.HALF_UP);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Número inválido em " + what + ": " + v);
        }
    }

    static BigDecimal qty(Object v, BigDecimal fallback) {
        if (v == null || String.valueOf(v).isBlank()) {
            return fallback;
        }
        try {
            BigDecimal n = v instanceof BigDecimal b ? b : new BigDecimal(String.valueOf(v).trim().replace(',', '.'));
            if (n.signum() <= 0) {
                throw new IllegalArgumentException("A quantidade precisa ser maior que zero.");
            }
            return n.setScale(3, RoundingMode.HALF_UP);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Quantidade inválida: " + v);
        }
    }

    static int intOf(Object v, int fallback) {
        if (v == null || String.valueOf(v).isBlank()) {
            return fallback;
        }
        try {
            return v instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Número inválido: " + v);
        }
    }

    static LocalDate date(Object v, LocalDate fallback) {
        if (v == null || String.valueOf(v).isBlank()) {
            return fallback;
        }
        try {
            return LocalDate.parse(String.valueOf(v).trim().substring(0, 10));
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Data inválida: " + v);
        }
    }

    static UUID uuid(Object v) {
        try {
            return v instanceof UUID u ? u : UUID.fromString(String.valueOf(v));
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Identificador inválido.");
        }
    }

    static long cents(BigDecimal value) {
        return value.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP).longValueExact();
    }

    /** Literal de array do Postgres ({"a","b"}), para cast(:x as text[]). */
    static String pgArray(List<String> items) {
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(items.get(i).replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        }
        return sb.append('}').toString();
    }

    static List<String> array(Object v) {
        if (v == null) {
            return List.of();
        }
        try {
            if (v instanceof Array a) {
                return Arrays.stream((Object[]) a.getArray()).map(String::valueOf).toList();
            }
        } catch (SQLException e) {
            return List.of();
        }
        if (v instanceof String[] s) {
            return List.of(s);
        }
        if (v instanceof List<?> l) {
            return l.stream().map(String::valueOf).toList();
        }
        return List.of();
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();

    /** Texto JSON (coluna jsonb) como objeto; nulo ou inválido vira nulo. */
    static Object json(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return JSON.readValue(text, Object.class);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return null;
        }
    }

    static String toJson(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return "{}";
        }
    }

    /** Linha pronta para virar JSON: arrays do banco viram listas, jsonb vira objeto. */
    static Map<String, Object> plain(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        row.forEach((k, v) -> {
            if (v instanceof Array) {
                out.put(k, array(v));
            } else if (v instanceof org.postgresql.util.PGobject pg) {
                out.put(k, json(pg.getValue()));
            } else {
                out.put(k, v);
            }
        });
        return out;
    }

    static List<Map<String, Object>> plain(List<Map<String, Object>> rows) {
        return rows.stream().map(Sql::plain).toList();
    }
}
