package com.pdv2cloud.service.storemap;

import static com.pdv2cloud.service.storemap.StoreDepartment.*;

import java.text.Normalizer;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Em que setor da loja cada produto está, sem cadastro manual.
 *
 * 1º pelo NCM do item da nota (a classificação fiscal é obrigatória e diz o
 * que o produto é: 2202 = refrigerante/água, 3402 = detergente…), do prefixo
 * mais longo para o mais curto; 2º pela categoria do catálogo; senão, Outros.
 */
public final class DepartmentClassifier {

    /** Prefixo de NCM → setor. Ordem de inserção irrelevante: vence o prefixo mais longo. */
    private static final Map<String, StoreDepartment> NCM = new LinkedHashMap<>();

    static {
        // Hortifruti e ovos
        put(HORTIFRUTI, "07", "08", "0407", "0409", "1212");
        // Carnes, aves e peixes frescos
        put(ACOUGUE, "02", "03");
        put(FRIOS_LATICINIOS, "0210", "0401", "0402", "0403", "0404", "0405", "0406", "1601", "1602");
        put(CONGELADOS, "0710", "0811", "2105", "160420");
        // Mercearia seca
        put(MERCEARIA, "0713", "0714", "0904", "0905", "0906", "0907", "0908", "0909", "0910",
            "10", "11", "12", "15", "1701", "1702", "1901", "1902", "20", "2103", "2104", "2106", "2501", "1604");
        put(MATINAIS, "0901", "0902", "0903", "1806", "1904", "2101");
        put(BISCOITOS_DOCES, "1704", "1801", "1802", "1803", "1804", "1805", "190531", "190532", "190540", "2008");
        put(PADARIA, "190510", "190520", "190590");
        put(BEBIDAS, "2009", "2201", "2202");
        put(BEBIDAS_ALCOOLICAS, "2203", "2204", "2205", "2206", "2207", "2208");
        put(TABACARIA, "24");
        put(HIGIENE, "3303", "3304", "3305", "3306", "3307", "3401", "4818", "9603", "9619", "3005");
        put(LIMPEZA, "3402", "3405", "3808", "2828", "3809", "5603", "6805");
        put(PET, "2309");
        put(BAZAR, "3924", "3926", "4819", "7013", "7323", "8205", "8211", "8215", "8506", "8539", "9405", "3604", "4823", "7607");
    }

    /** Palavras da categoria do catálogo → setor (quando o item não tem NCM). */
    private static final List<Map.Entry<String, StoreDepartment>> KEYWORDS = List.of(
        Map.entry("hortifruti", HORTIFRUTI), Map.entry("fruta", HORTIFRUTI), Map.entry("verdura", HORTIFRUTI), Map.entry("legume", HORTIFRUTI),
        Map.entry("acougue", ACOUGUE), Map.entry("carne", ACOUGUE), Map.entry("aves", ACOUGUE), Map.entry("peixe", ACOUGUE),
        Map.entry("frios", FRIOS_LATICINIOS), Map.entry("laticin", FRIOS_LATICINIOS), Map.entry("queijo", FRIOS_LATICINIOS), Map.entry("iogurte", FRIOS_LATICINIOS), Map.entry("leite", FRIOS_LATICINIOS),
        Map.entry("congelad", CONGELADOS), Map.entry("sorvete", CONGELADOS),
        Map.entry("padaria", PADARIA), Map.entry("pao", PADARIA), Map.entry("paes", PADARIA),
        Map.entry("cerveja", BEBIDAS_ALCOOLICAS), Map.entry("vinho", BEBIDAS_ALCOOLICAS), Map.entry("destilad", BEBIDAS_ALCOOLICAS), Map.entry("alcool", BEBIDAS_ALCOOLICAS),
        Map.entry("bebida", BEBIDAS), Map.entry("refrigerante", BEBIDAS), Map.entry("suco", BEBIDAS), Map.entry("agua", BEBIDAS),
        Map.entry("cafe", MATINAIS), Map.entry("matina", MATINAIS), Map.entry("cereal", MATINAIS),
        Map.entry("biscoito", BISCOITOS_DOCES), Map.entry("doce", BISCOITOS_DOCES), Map.entry("chocolate", BISCOITOS_DOCES), Map.entry("bomboniere", BISCOITOS_DOCES),
        Map.entry("limpeza", LIMPEZA), Map.entry("detergente", LIMPEZA),
        Map.entry("higiene", HIGIENE), Map.entry("perfumaria", HIGIENE), Map.entry("beleza", HIGIENE), Map.entry("fralda", HIGIENE),
        Map.entry("pet shop", PET), Map.entry("petshop", PET), Map.entry("animais", PET), Map.entry("racao", PET),
        Map.entry("bazar", BAZAR), Map.entry("utilidade", BAZAR), Map.entry("descartave", BAZAR),
        Map.entry("cigarro", TABACARIA), Map.entry("tabac", TABACARIA),
        Map.entry("mercearia", MERCEARIA), Map.entry("grao", MERCEARIA), Map.entry("massa", MERCEARIA), Map.entry("enlatad", MERCEARIA),
        Map.entry("tempero", MERCEARIA), Map.entry("oleo", MERCEARIA), Map.entry("arroz", MERCEARIA), Map.entry("feijao", MERCEARIA), Map.entry("acucar", MERCEARIA));

    private DepartmentClassifier() {}

    private static void put(StoreDepartment dept, String... prefixes) {
        for (String p : prefixes) NCM.put(p, dept);
    }

    public static StoreDepartment classify(String ncm, String category) {
        String digits = ncm == null ? "" : ncm.replaceAll("\\D", "");
        for (int len = Math.min(6, digits.length()); len >= 2; len--) {
            StoreDepartment d = NCM.get(digits.substring(0, len));
            if (d != null) return d;
        }
        if (category != null && !category.isBlank()) {
            String c = normalize(category);
            for (Map.Entry<String, StoreDepartment> e : KEYWORDS) {
                if (c.contains(e.getKey())) return e.getValue();
            }
        }
        return OUTROS;
    }

    static String normalize(String s) {
        return Normalizer.normalize(s, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT);
    }
}
