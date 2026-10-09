package com.pdv2cloud.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;

public final class ProductCatalogUtils {

    private ProductCatalogUtils() {
    }

    public static String normalizeGtin(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        if (trimmed.isBlank()) {
            return null;
        }

        String upper = trimmed.toUpperCase();
        if ("SEM GTIN".equals(upper) || "SEMGTIN".equals(upper) || "NULL".equals(upper)) {
            return null;
        }

        String digits = trimmed.replaceAll("\\D", "");
        if (digits.isBlank() || digits.replace("0", "").isBlank()) {
            return null;
        }

        if (digits.length() < 8 || digits.length() > 14) {
            return null;
        }

        return digits;
    }

    /**
     * Etiqueta de balança / circulação restrita (GS1 prefixo 2): o código é da loja,
     * não do produto no mundo, e traz o preço ou o peso embutido. EAN-13 iniciado
     * em 2 ou UPC-A iniciado em 2 (peso variável), aceitando zeros à esquerda.
     */
    public static boolean isScaleBarcode(String gtin) {
        if (gtin == null) {
            return false;
        }
        String stripped = gtin.replaceFirst("^0+", "");
        return (stripped.length() == 13 || stripped.length() == 12) && stripped.charAt(0) == '2';
    }

    /**
     * Parte fixa da etiqueta de balança: o prefixo 2 e os 6 dígitos seguintes
     * (código do item na balança, de 5 ou 6 dígitos conforme o fabricante). O
     * restante é o valor variável e o dígito verificador.
     */
    public static String scaleItemCode(String gtin) {
        String stripped = gtin.replaceFirst("^0+", "");
        if (stripped.length() == 12) {
            stripped = "0" + stripped;
        }
        return stripped.substring(0, Math.min(7, stripped.length()));
    }

    public static String normalizeName(String value) {
        if (value == null) {
            return "";
        }

        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase()
            .replaceAll("[^a-z0-9]+", " ")
            .trim()
            .replaceAll("\\s+", " ");

        return normalized;
    }

    public static String canonicalizeDisplayName(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim().replaceAll("\\s+", " ");
        return trimmed.isBlank() ? null : trimmed;
    }

    public static String normalizeInternalCode(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isBlank() ? null : trimmed.toUpperCase();
    }

    public static String shortHash(String value, int size) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.substring(0, Math.min(size, sb.length()));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to hash value", ex);
        }
    }
}
