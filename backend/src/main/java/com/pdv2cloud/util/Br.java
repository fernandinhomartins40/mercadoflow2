package com.pdv2cloud.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Números e datas como o dono do mercado lê: "R$ 1.234,56", "1.812 un.",
 * "29,5 por dia", "3 dias", "12%", "03/10". Para todo texto que chega à tela.
 *
 * Não mude o idioma padrão do servidor no lugar disto: Pix, SVG dos encartes
 * e integrações formatam número com ponto de propósito.
 */
public final class Br {

    private static final Locale PT_BR = Locale.forLanguageTag("pt-BR");
    private static final DecimalFormatSymbols SYMBOLS = DecimalFormatSymbols.getInstance(PT_BR);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM");
    private static final DateTimeFormatter FULL = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private Br() {
    }

    private static BigDecimal bd(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal b) return b;
        if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try {
            return new BigDecimal(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String fmt(BigDecimal v, String pattern) {
        DecimalFormat f = new DecimalFormat(pattern, SYMBOLS);
        f.setRoundingMode(RoundingMode.HALF_UP);
        return f.format(v);
    }

    /** R$ 1.234,56 (ou "—"). */
    public static String money(Object v) {
        BigDecimal b = bd(v);
        return b == null ? "—" : "R$ " + fmt(b, "#,##0.00");
    }

    /** Quantidade inteira com milhar: 1.812 (arredonda para cima, como se compra). */
    public static String units(Object v) {
        BigDecimal b = bd(v);
        return b == null ? "—" : fmt(b.setScale(0, RoundingMode.CEILING), "#,##0");
    }

    /** Venda por dia com uma casa só quando faz diferença: 29,5 · 3 · 0,3. */
    public static String perDay(Object v) {
        BigDecimal b = bd(v);
        if (b == null) return "—";
        return fmt(b, b.abs().compareTo(BigDecimal.TEN) >= 0 ? "#,##0" : "#,##0.#");
    }

    /** Número com até {@code decimals} casas: 1,25. */
    public static String num(Object v, int decimals) {
        BigDecimal b = bd(v);
        return b == null ? "—" : fmt(b, decimals <= 0 ? "#,##0" : "#,##0." + "#".repeat(decimals));
    }

    /** "1 dia", "3 dias", "menos de 1 dia". */
    public static String days(Object v) {
        BigDecimal b = bd(v);
        if (b == null) return "tempo desconhecido";
        long d = b.setScale(0, RoundingMode.HALF_UP).longValue();
        if (d < 1) return "menos de 1 dia";
        return fmt(BigDecimal.valueOf(d), "#,##0") + (d == 1 ? " dia" : " dias");
    }

    /** Percentual: 12% (uma casa só quando existe: 12,5%). */
    public static String pct(Object v) {
        BigDecimal b = bd(v);
        return b == null ? "—" : fmt(b, "#,##0.#") + "%";
    }

    /** 03/10 (aceita LocalDate ou texto ISO). */
    public static String date(Object v) {
        if (v == null) return "—";
        try {
            LocalDate d = v instanceof LocalDate l ? l : LocalDate.parse(String.valueOf(v).substring(0, 10));
            return d.getYear() == LocalDate.now().getYear() ? d.format(DAY) : d.format(FULL);
        } catch (Exception e) {
            return String.valueOf(v);
        }
    }

    /** Ritmo (1,0 = normal) como frase: "vendendo 12% acima do normal". */
    public static String pace(double momentum) {
        double diff = (momentum - 1.0) * 100;
        if (Math.abs(diff) < 5) return "vendendo no ritmo normal";
        return "vendendo " + Math.round(Math.abs(diff)) + "% " + (diff > 0 ? "acima" : "abaixo") + " do normal";
    }

    /** Curva ABC em palavras. */
    public static String rank(String abc) {
        if ("A".equals(abc)) return "entre os que mais vendem";
        if ("B".equals(abc)) return "vende bem";
        return "vende pouco";
    }
}
