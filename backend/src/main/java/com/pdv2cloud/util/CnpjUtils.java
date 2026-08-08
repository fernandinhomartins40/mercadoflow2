package com.pdv2cloud.util;

/**
 * Utilitários de CNPJ.
 *
 * A raiz — os 8 primeiros dígitos — identifica a EMPRESA, enquanto os 4 dígitos
 * seguintes identificam a filial. Duas lojas da mesma rede compartilham a raiz
 * e diferem apenas no sufixo:
 *
 *   12.345.678/0001-95  matriz
 *   12.345.678/0002-76  filial
 *   └──────┬─────┘
 *        raiz
 *
 * É essa propriedade que permite detectar uma rede tentando se cadastrar como
 * várias contas independentes para caber num plano barato.
 */
public final class CnpjUtils {

    private static final int ROOT_LENGTH = 8;
    private static final int FULL_LENGTH = 14;

    private CnpjUtils() {
    }

    /** Remove máscara e qualquer caractere não numérico. */
    public static String digitsOnly(String cnpj) {
        if (cnpj == null) {
            return null;
        }
        String digits = cnpj.replaceAll("\\D", "");
        return digits.isEmpty() ? null : digits;
    }

    /**
     * Raiz do CNPJ (8 primeiros dígitos), ou null quando não há dígitos
     * suficientes para identificar a empresa.
     */
    public static String root(String cnpj) {
        String digits = digitsOnly(cnpj);
        if (digits == null || digits.length() < ROOT_LENGTH) {
            return null;
        }
        return digits.substring(0, ROOT_LENGTH);
    }

    /** Sufixo da filial (0001 = matriz), ou null se o CNPJ for incompleto. */
    public static String branchSuffix(String cnpj) {
        String digits = digitsOnly(cnpj);
        if (digits == null || digits.length() < 12) {
            return null;
        }
        return digits.substring(8, 12);
    }

    /** True quando o CNPJ é o da matriz da empresa (sufixo 0001). */
    public static boolean isHeadquarters(String cnpj) {
        return "0001".equals(branchSuffix(cnpj));
    }

    /** Duas lojas da mesma empresa. */
    public static boolean sameCompany(String cnpjA, String cnpjB) {
        String rootA = root(cnpjA);
        String rootB = root(cnpjB);
        return rootA != null && rootA.equals(rootB);
    }

    /** Formata para exibição: 12.345.678/0001-95. */
    public static String format(String cnpj) {
        String digits = digitsOnly(cnpj);
        if (digits == null || digits.length() != FULL_LENGTH) {
            return cnpj;
        }
        return String.format(
            "%s.%s.%s/%s-%s",
            digits.substring(0, 2),
            digits.substring(2, 5),
            digits.substring(5, 8),
            digits.substring(8, 12),
            digits.substring(12, 14)
        );
    }
}
