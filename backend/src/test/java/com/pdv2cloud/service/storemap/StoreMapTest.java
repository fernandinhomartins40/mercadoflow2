package com.pdv2cloud.service.storemap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.pdv2cloud.service.storemap.StoreMapInsights.Insight;
import com.pdv2cloud.service.storemap.StoreMapService.DepartmentPair;
import com.pdv2cloud.service.storemap.StoreMapService.DepartmentStat;
import com.pdv2cloud.service.storemap.StoreMapService.DepartmentsReport;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class StoreMapTest {

    // ── Classificação ───────────────────────────────────────────────────────

    @Test
    @DisplayName("NCM da nota define o setor; vence o prefixo mais longo")
    void classifiesByNcm() {
        assertEquals(StoreDepartment.BEBIDAS, DepartmentClassifier.classify("22021000", null));
        assertEquals(StoreDepartment.BEBIDAS_ALCOOLICAS, DepartmentClassifier.classify("2203.00.00", null));
        assertEquals(StoreDepartment.LIMPEZA, DepartmentClassifier.classify("34022000", null));
        assertEquals(StoreDepartment.FRIOS_LATICINIOS, DepartmentClassifier.classify("04012010", null));
        assertEquals(StoreDepartment.ACOUGUE, DepartmentClassifier.classify("02013000", null));
        assertEquals(StoreDepartment.FRIOS_LATICINIOS, DepartmentClassifier.classify("02101200", null)); // bacon: 0210 vence 02
        assertEquals(StoreDepartment.PADARIA, DepartmentClassifier.classify("19059020", null));
        assertEquals(StoreDepartment.BISCOITOS_DOCES, DepartmentClassifier.classify("19053100", null));
        assertEquals(StoreDepartment.MERCEARIA, DepartmentClassifier.classify("10063021", null)); // arroz
        assertEquals(StoreDepartment.MATINAIS, DepartmentClassifier.classify("09012100", null)); // café
    }

    @Test
    @DisplayName("sem NCM usa a categoria do catálogo, sem acento; senão Outros")
    void fallsBackToCategory() {
        assertEquals(StoreDepartment.LIMPEZA, DepartmentClassifier.classify(null, "Limpeza e Lavanderia"));
        assertEquals(StoreDepartment.PADARIA, DepartmentClassifier.classify("", "Pães e Bolos"));
        assertEquals(StoreDepartment.BISCOITOS_DOCES, DepartmentClassifier.classify(null, "Biscoitos"));
        assertEquals(StoreDepartment.OUTROS, DepartmentClassifier.classify(null, "Tapetes"));
        assertEquals(StoreDepartment.OUTROS, DepartmentClassifier.classify("99999999", null));
    }

    // ── Planta ──────────────────────────────────────────────────────────────

    private static Map<String, Object> fx(String id, String type, double x, double y, double w, double h, String... depts) {
        return Map.of("id", id, "type", type, "x", x, "y", y, "w", w, "h", h, "label", id, "departments", List.of(depts));
    }

    @Test
    @DisplayName("planta salva só com tipos e setores conhecidos, dentro dos limites")
    void sanitizesPlan() {
        Map<String, Object> raw = Map.of("width", 20, "height", 14, "fixtures", List.of(
            fx("a", "gondola", 2, 2, 1, 6, "MERCEARIA", "INVALIDO", "MERCEARIA"),
            fx("b", "nave-espacial", 1, 1, 1, 1),
            fx("c", "caixa", 999, 5, 2, 1, "BEBIDAS")));
        Map<String, Object> clean = StorePlan.sanitize(raw, 400);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> fixtures = (List<Map<String, Object>>) clean.get("fixtures");
        assertEquals(2, fixtures.size(), "tipo desconhecido descartado");
        assertEquals(List.of("MERCEARIA"), fixtures.get(0).get("departments"), "setor inválido e repetido descartados");
        assertEquals(20.0, fixtures.get(1).get("x"), "posição limitada à planta");
        assertEquals(List.of(), fixtures.get(1).get("departments"), "caixa não expõe setor");
        List<Map<String, Object>> many = new ArrayList<>();
        for (int i = 0; i < 5; i++) many.add(fx("g" + i, "gondola", 1, 1, 1, 1));
        assertThrows(IllegalArgumentException.class, () -> StorePlan.sanitize(Map.of("fixtures", many), 4));
    }

    // ── Sugestões ───────────────────────────────────────────────────────────

    private static DepartmentStat stat(StoreDepartment d, double revenue, double share, int baskets) {
        return new DepartmentStat(d.name(), d.label(), d.magnet(), d.cold(), BigDecimal.valueOf(revenue), share,
            baskets, baskets / 1000.0, 10, List.of());
    }

    private static List<Insight> insights(List<Map<String, Object>> fixtures, List<DepartmentStat> stats,
                                          List<DepartmentPair> pairs, List<String> endCaps) {
        StorePlan plan = StorePlan.from(Map.of("width", 30, "height", 20, "fixtures", fixtures));
        return StoreMapInsights.build(plan, new DepartmentsReport(30, 1000, BigDecimal.valueOf(100000), stats, pairs), endCaps);
    }

    private static Insight find(List<Insight> list, String kind) {
        return list.stream().filter(i -> i.kind().equals(kind)).findFirst().orElse(null);
    }

    @Test
    @DisplayName("setor que vende e não está no mapa pede lugar; setor pequeno não")
    void asksToPlaceSellingDepartments() {
        List<Insight> out = insights(List.of(fx("g1", "gondola", 5, 5, 1, 6, "MERCEARIA")),
            List.of(stat(StoreDepartment.MERCEARIA, 50000, 0.5, 600), stat(StoreDepartment.BEBIDAS, 14000, 0.14, 300),
                stat(StoreDepartment.PET, 500, 0.005, 10)),
            List.of(), List.of());
        Insight place = find(out, "PLACE");
        assertTrue(place.title().contains("Bebidas"));
        assertTrue(place.text().contains("14%"));
        assertFalse(out.stream().anyMatch(i -> i.title().contains("Pet")));
    }

    @Test
    @DisplayName("frio em gôndola seca é apontado; em geladeira não")
    void warnsColdOnDryFixture() {
        List<Insight> out = insights(List.of(
                fx("g1", "gondola", 5, 5, 1, 6, "CONGELADOS"),
                fx("gel", "geladeira", 0, 0, 6, 1, "FRIOS_LATICINIOS")),
            List.of(stat(StoreDepartment.CONGELADOS, 5000, 0.05, 100), stat(StoreDepartment.FRIOS_LATICINIOS, 8000, 0.08, 200)),
            List.of(), List.of());
        List<Insight> cold = out.stream().filter(i -> i.kind().equals("COLD")).toList();
        assertEquals(1, cold.size());
        assertEquals(List.of("g1"), cold.get(0).fixtureIds());
    }

    @Test
    @DisplayName("setores que saem juntos e estão longe: sugere aproximar, com os números")
    void suggestsBringingTogether() {
        List<Insight> out = insights(List.of(
                fx("pad", "balcao", 0, 0, 4, 1, "PADARIA"),
                fx("caf", "gondola", 27, 14, 1, 5, "MATINAIS")),
            List.of(stat(StoreDepartment.PADARIA, 20000, 0.2, 400), stat(StoreDepartment.MATINAIS, 9000, 0.09, 200)),
            List.of(new DepartmentPair("MATINAIS", "PADARIA", 120, 2.1)), List.of());
        Insight closer = find(out, "CLOSER");
        assertTrue(closer.text().contains("2,1×"), closer.text());
        assertTrue(closer.text().startsWith("Em 60% das compras com café e matinais"), closer.text());
        assertTrue(closer.fixtureIds().containsAll(List.of("pad", "caf")));
    }

    @Test
    @DisplayName("pares perto, com pouca afinidade ou pouca compra não viram sugestão")
    void ignoresWeakOrNearPairs() {
        List<Map<String, Object>> near = List.of(
            fx("pad", "balcao", 0, 0, 4, 1, "PADARIA"), fx("caf", "gondola", 5, 0, 1, 5, "MATINAIS"));
        List<DepartmentStat> stats = List.of(stat(StoreDepartment.PADARIA, 20000, 0.2, 400), stat(StoreDepartment.MATINAIS, 9000, 0.09, 200));
        assertEquals(null, find(insights(near, stats, List.of(new DepartmentPair("MATINAIS", "PADARIA", 120, 2.1)), List.of()), "CLOSER"));
        List<Map<String, Object>> far = List.of(
            fx("pad", "balcao", 0, 0, 4, 1, "PADARIA"), fx("caf", "gondola", 27, 14, 1, 5, "MATINAIS"));
        assertEquals(null, find(insights(far, stats, List.of(new DepartmentPair("MATINAIS", "PADARIA", 120, 1.1)), List.of()), "CLOSER"));
        assertEquals(null, find(insights(far, stats, List.of(new DepartmentPair("MATINAIS", "PADARIA", 3, 3.0)), List.of()), "CLOSER"));
    }

    @Test
    @DisplayName("setor de destino colado na entrada: sugere levar para o fundo")
    void magnetNearEntrance() {
        List<Insight> out = insights(List.of(
                fx("ent", "entrada", 14, 19, 2, 1),
                fx("beb", "geladeira", 13, 16, 4, 1, "BEBIDAS"),
                fx("g1", "gondola", 5, 5, 1, 6, "MERCEARIA"),
                fx("g2", "gondola", 9, 5, 1, 6, "LIMPEZA")),
            List.of(stat(StoreDepartment.BEBIDAS, 14000, 0.14, 300), stat(StoreDepartment.MERCEARIA, 50000, 0.5, 600),
                stat(StoreDepartment.LIMPEZA, 8000, 0.08, 150)),
            List.of(), List.of());
        Insight magnet = find(out, "MAGNET");
        assertTrue(magnet.title().contains("Bebidas"));
        assertEquals(List.of("beb"), magnet.fixtureIds());
    }

    @Test
    @DisplayName("sugestões ordenadas pela prioridade; móveis sem setor e pontas sugeridas")
    void emptyAndEndCaps() {
        List<Insight> out = insights(List.of(
                fx("g1", "gondola", 5, 5, 1, 6),
                fx("p1", "ponta", 5, 11, 1, 1)),
            List.of(), List.of(), List.of("Coca-Cola 2L", "Pão francês"));
        assertEquals(List.of("END_CAP", "EMPTY"), out.stream().map(Insight::kind).toList());
        assertTrue(find(out, "END_CAP").text().contains("Coca-Cola 2L, Pão francês"));
        assertEquals(List.of("g1", "p1"), find(out, "EMPTY").fixtureIds());
    }
}
