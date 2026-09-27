package com.pdv2cloud.service.storemap;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Planta da loja vista de cima, em metros aproximados.
 *
 * Guardada como JSON (store_layouts.plan): {@code {version, width, height,
 * fixtures:[{id, type, x, y, w, h, label, departments:[...]}]}}. O servidor só
 * aceita tipos e setores conhecidos e limita tamanhos, para o JSON salvo pela
 * tela nunca virar um depósito arbitrário.
 */
public record StorePlan(double width, double height, List<Fixture> fixtures) {

    public static final Set<String> TYPES = Set.of(
        "gondola", "ponta", "geladeira", "freezer", "ilha", "banca", "balcao", "caixa", "entrada");
    /** Móveis que conservam frio. */
    public static final Set<String> COLD_TYPES = Set.of("geladeira", "freezer", "balcao");
    /** Móveis que não expõem produto. */
    public static final Set<String> NON_PRODUCT_TYPES = Set.of("entrada", "caixa");

    public record Fixture(String id, String type, double x, double y, double w, double h,
                          String label, List<StoreDepartment> departments) {
        public double cx() { return x + w / 2; }
        public double cy() { return y + h / 2; }
        public double distanceTo(Fixture o) { return Math.hypot(cx() - o.cx(), cy() - o.cy()); }
        public double distanceTo(double px, double py) { return Math.hypot(cx() - px, cy() - py); }
    }

    public double diagonal() { return Math.hypot(width, height); }

    /** Centro da entrada; sem entrada desenhada, o meio da parede da frente. */
    public double[] entrance() {
        return fixtures.stream().filter(f -> "entrada".equals(f.type())).findFirst()
            .map(f -> new double[] {f.cx(), f.cy()})
            .orElse(new double[] {width / 2, height});
    }

    public List<Fixture> fixturesWith(StoreDepartment d) {
        return fixtures.stream().filter(f -> f.departments().contains(d)).toList();
    }

    @SuppressWarnings("unchecked")
    public static StorePlan from(Map<String, Object> raw) {
        double width = clamp(num(raw.get("width"), 20), 4, 200);
        double height = clamp(num(raw.get("height"), 14), 4, 200);
        List<Fixture> fixtures = new ArrayList<>();
        Object list = raw.get("fixtures");
        if (list instanceof List<?> items) {
            for (Object o : items) {
                if (!(o instanceof Map<?, ?> m)) continue;
                String type = String.valueOf(m.get("type"));
                if (!TYPES.contains(type)) continue;
                List<StoreDepartment> depts = new ArrayList<>();
                if (m.get("departments") instanceof List<?> ds) {
                    for (Object d : ds) {
                        try {
                            StoreDepartment dept = StoreDepartment.valueOf(String.valueOf(d));
                            if (!depts.contains(dept)) depts.add(dept);
                        } catch (IllegalArgumentException ignored) {
                            // setor desconhecido: descartado
                        }
                    }
                }
                String id = String.valueOf(m.get("id"));
                String label = m.get("label") == null ? "" : String.valueOf(m.get("label"));
                fixtures.add(new Fixture(
                    id.length() > 40 ? id.substring(0, 40) : id,
                    type,
                    clamp(num(m.get("x"), 0), 0, width),
                    clamp(num(m.get("y"), 0), 0, height),
                    clamp(num(m.get("w"), 1), 0.3, width),
                    clamp(num(m.get("h"), 1), 0.3, height),
                    label.length() > 40 ? label.substring(0, 40) : label,
                    NON_PRODUCT_TYPES.contains(type) ? List.of() : depts));
            }
        }
        return new StorePlan(width, height, fixtures);
    }

    /** Versão limpa para gravar: só o que {@link #from} entende. */
    public static Map<String, Object> sanitize(Map<String, Object> raw, int maxFixtures) {
        if (raw == null) throw new IllegalArgumentException("Planta vazia");
        StorePlan plan = from(raw);
        if (plan.fixtures().size() > maxFixtures) {
            throw new IllegalArgumentException("A planta aceita até " + maxFixtures + " móveis");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", 2);
        out.put("width", plan.width());
        out.put("height", plan.height());
        List<Map<String, Object>> fx = new ArrayList<>();
        for (Fixture f : plan.fixtures()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", f.id());
            m.put("type", f.type());
            m.put("x", round(f.x()));
            m.put("y", round(f.y()));
            m.put("w", round(f.w()));
            m.put("h", round(f.h()));
            m.put("label", f.label());
            m.put("departments", f.departments().stream().map(Enum::name).toList());
            fx.add(m);
        }
        out.put("fixtures", fx);
        return out;
    }

    private static double num(Object v, double fallback) {
        if (v instanceof Number n) return Double.isFinite(n.doubleValue()) ? n.doubleValue() : fallback;
        try {
            double d = Double.parseDouble(String.valueOf(v));
            return Double.isFinite(d) ? d : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static double clamp(double v, double min, double max) {
        return Math.max(min, Math.min(max, v));
    }

    private static double round(double v) {
        return Math.round(v * 100) / 100.0;
    }
}
