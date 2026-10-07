package com.pdv2cloud.service.localprice;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Conferências da descrição da nota contra o nosso produto. O GTIN na NFC-e é
 * digitado por cada loja e às vezes aponta outro item (no teste de 07/10/2026,
 * suco DV Frut e fardo de 6 no código da Coca-Cola 2 L).
 */
final class TextMatch {

    private static final Pattern QTY = Pattern.compile("(\\d+(?:[.,]\\d+)?)\\s*(ML|LTS|LT|L|KG|GRS|GR|G)\\b");
    private static final Pattern PACK = Pattern.compile(
        "\\b(CX|CXA|FD|FDO|FARDO|PACK|KIT|DISPLAY|C/\\s*\\d+|\\d+\\s*X\\s*\\d+|([2-9]|\\d{2,})\\s*UN(D|ID)?S?|([2-9]|\\d{2,})\\s*FL)\\b");
    /** Estabelecimentos que vendem com outra lógica de preço (dose, conveniência, prato). */
    private static final Pattern NOT_GROCERY = Pattern.compile(
        "\\b(POSTO|AUTO POSTO|COMBUSTIVE(L|IS)|CONVENIENCIA|BAR|BOTECO|CHOPP|CHOPERIA|LANCHONETE|LANCHES|RESTAURANTE|PIZZARIA|PIZZA|HOTEL|"
            + "PETROBRAS|SHELL|IPIRANGA|TABACARIA|DISK)\\b");

    private TextMatch() {
    }

    static String norm(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return n.toUpperCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    /** Volume ou peso em ml/g (null se a descrição não traz). */
    static Double quantity(String text) {
        Matcher m = QTY.matcher(norm(text));
        Double found = null;
        while (m.find()) {
            double v = Double.parseDouble(m.group(1).replace(',', '.'));
            String u = m.group(2);
            found = switch (u) {
                case "L", "LT", "LTS" -> v * 1000;
                case "KG" -> v * 1000;
                default -> v;
            };
        }
        return found;
    }

    static boolean pack(String text) {
        return PACK.matcher(norm(text)).find();
    }

    /** Mesmo produto? Tamanhos diferentes ou fardo onde o nosso é unidade: não. */
    static boolean sameProduct(String ours, String theirs) {
        Double a = quantity(ours);
        Double b = quantity(theirs);
        if (a != null && b != null && Math.abs(a - b) > Math.max(a, b) * 0.05) return false;
        return pack(ours) || !pack(theirs);
    }

    static boolean notGrocery(String storeNames) {
        return NOT_GROCERY.matcher(norm(storeNames)).find();
    }
}
