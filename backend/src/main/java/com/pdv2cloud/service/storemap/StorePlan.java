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

    /** Lados com prateleira: gôndola e ilha têm dois (A e B); os demais móveis, um. */
    public static final Set<String> TWO_SIDED = Set.of("gondola", "ilha");
    public static final Set<String> SHELF_KINDS = Set.of("prateleira", "gancheira", "cesto", "grade");
    static final int MAX_MODULES = 40;
    static final int MAX_SHELVES = 12;
    static final int MAX_SLOTS_PER_SHELF = 20;
    static final int MAX_SLOTS = 30_000;

    /**
     * Espaço de uma prateleira, da esquerda para a direita. {@code share} é a
     * fração da largura da prateleira (0,8 = 80%): fração e não centímetros para
     * a divisão continuar certa quando a largura do módulo for corrigida.
     * Identifica um produto do catálogo, um setor inteiro ou só um nome livre.
     */
    public record Slot(String productId, String department, String label, double share, Integer facings) {}

    /** Prateleira de um módulo; a lista do módulo vai de cima para baixo. */
    public record Shelf(String id, String kind, List<Slot> slots) {}

    /** Trecho da gôndola entre duas colunas, com largura e prateleiras próprias. */
    public record Module(String id, int widthCm, List<Shelf> shelves) {}

    public record Side(String key, List<Module> modules) {}

    public record Fixture(String id, String type, double x, double y, double w, double h,
                          String label, List<StoreDepartment> departments, List<Side> sides) {
        public Fixture(String id, String type, double x, double y, double w, double h,
                       String label, List<StoreDepartment> departments) {
            this(id, type, x, y, w, h, label, departments, List.of());
        }
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
                boolean products = !NON_PRODUCT_TYPES.contains(type);
                fixtures.add(new Fixture(
                    cut(id, 40),
                    type,
                    clamp(num(m.get("x"), 0), 0, width),
                    clamp(num(m.get("y"), 0), 0, height),
                    clamp(num(m.get("w"), 1), 0.3, width),
                    clamp(num(m.get("h"), 1), 0.3, height),
                    cut(label, 40),
                    products ? depts : List.of(),
                    products ? sides(m.get("sides"), TWO_SIDED.contains(type) ? 2 : 1) : List.of()));
            }
        }
        return new StorePlan(width, height, fixtures);
    }

    /** Lados → módulos → prateleiras → espaços; o que não for reconhecível é descartado. */
    private static List<Side> sides(Object raw, int maxSides) {
        List<Side> out = new ArrayList<>();
        if (!(raw instanceof List<?> list)) return out;
        for (Object so : list) {
            if (out.size() >= maxSides || !(so instanceof Map<?, ?> s)) continue;
            String key = String.valueOf(s.get("key"));
            if (!Set.of("A", "B").contains(key) || out.stream().anyMatch(x -> x.key().equals(key))) continue;
            List<Module> modules = new ArrayList<>();
            if (s.get("modules") instanceof List<?> ms) {
                for (Object mo : ms) {
                    if (modules.size() >= MAX_MODULES || !(mo instanceof Map<?, ?> mm)) continue;
                    List<Shelf> shelves = new ArrayList<>();
                    if (mm.get("shelves") instanceof List<?> shs) {
                        for (Object sho : shs) {
                            if (shelves.size() >= MAX_SHELVES || !(sho instanceof Map<?, ?> sh)) continue;
                            String kind = String.valueOf(sh.get("kind"));
                            shelves.add(new Shelf(cut(String.valueOf(sh.get("id")), 40),
                                SHELF_KINDS.contains(kind) ? kind : "prateleira", slots(sh.get("slots"))));
                        }
                    }
                    modules.add(new Module(cut(String.valueOf(mm.get("id")), 40),
                        (int) Math.round(clamp(num(mm.get("widthCm"), 100), 20, 400)), shelves));
                }
            }
            out.add(new Side(key, modules));
        }
        return out;
    }

    private static List<Slot> slots(Object raw) {
        List<Slot> out = new ArrayList<>();
        if (!(raw instanceof List<?> list)) return out;
        for (Object o : list) {
            if (out.size() >= MAX_SLOTS_PER_SHELF || !(o instanceof Map<?, ?> m)) continue;
            String productId = null;
            if (m.get("productId") != null) {
                try {
                    productId = java.util.UUID.fromString(String.valueOf(m.get("productId"))).toString();
                } catch (IllegalArgumentException ignored) {
                    // id que não é de produto: espaço fica só com setor ou nome
                }
            }
            String department = null;
            if (m.get("department") != null) {
                try {
                    department = StoreDepartment.valueOf(String.valueOf(m.get("department"))).name();
                } catch (IllegalArgumentException ignored) {
                    // setor desconhecido: descartado
                }
            }
            String label = m.get("label") == null ? null : cut(String.valueOf(m.get("label")).trim(), 40);
            if (label != null && label.isEmpty()) label = null;
            if (productId == null && department == null && label == null) continue;
            double share = num(m.get("share"), 0);
            if (!(share > 0)) continue;
            Integer facings = m.get("facings") == null ? null : (int) Math.round(clamp(num(m.get("facings"), 1), 1, 99));
            out.add(new Slot(productId, department, label, Math.min(1, share), facings));
        }
        // A prateleira nunca passa de 100%: excesso vira proporção do que cabe.
        double total = out.stream().mapToDouble(Slot::share).sum();
        if (total > 1.0001) {
            out.replaceAll(s -> new Slot(s.productId(), s.department(), s.label(), s.share() / total, s.facings()));
        }
        return out;
    }

    /** Ids de produto usados nas prateleiras, sem repetir. */
    public java.util.Set<String> productIds() {
        java.util.Set<String> ids = new java.util.LinkedHashSet<>();
        for (Fixture f : fixtures) for (Side s : f.sides()) for (Module m : s.modules())
            for (Shelf sh : m.shelves()) for (Slot sl : sh.slots()) if (sl.productId() != null) ids.add(sl.productId());
        return ids;
    }

    /** Onde um produto está: móvel, lado, módulo e prateleira (1 = a de cima), e o trecho que ocupa. */
    public record Place(String fixtureId, String fixtureLabel, String side, int module, int modules,
                        int shelf, int shelves, double start, double share) {}

    public List<Place> placesOf(String productId) {
        List<Place> out = new ArrayList<>();
        for (Fixture f : fixtures) for (Side s : f.sides()) {
            for (int mi = 0; mi < s.modules().size(); mi++) {
                Module m = s.modules().get(mi);
                for (int si = 0; si < m.shelves().size(); si++) {
                    double start = 0;
                    for (Slot sl : m.shelves().get(si).slots()) {
                        if (productId.equals(sl.productId())) {
                            out.add(new Place(f.id(), f.label(), s.key(), mi + 1, s.modules().size(),
                                si + 1, m.shelves().size(), round(start), round(sl.share())));
                        }
                        start += sl.share();
                    }
                }
            }
        }
        return out;
    }

    /** Versão limpa para gravar: só o que {@link #from} entende. */
    public static Map<String, Object> sanitize(Map<String, Object> raw, int maxFixtures) {
        if (raw == null) throw new IllegalArgumentException("Planta vazia");
        StorePlan plan = from(raw);
        if (plan.fixtures().size() > maxFixtures) {
            throw new IllegalArgumentException("A planta aceita até " + maxFixtures + " móveis");
        }
        long slots = plan.fixtures().stream().flatMap(f -> f.sides().stream()).flatMap(s -> s.modules().stream())
            .flatMap(m -> m.shelves().stream()).mapToLong(sh -> sh.slots().size()).sum();
        if (slots > MAX_SLOTS) {
            throw new IllegalArgumentException("A planta aceita até " + MAX_SLOTS + " espaços de prateleira");
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
            if (!f.sides().isEmpty()) m.put("sides", f.sides().stream().map(StorePlan::sideMap).toList());
            fx.add(m);
        }
        out.put("fixtures", fx);
        return out;
    }

    private static Map<String, Object> sideMap(Side s) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", s.key());
        out.put("modules", s.modules().stream().map(m -> {
            Map<String, Object> mm = new LinkedHashMap<>();
            mm.put("id", m.id());
            mm.put("widthCm", m.widthCm());
            mm.put("shelves", m.shelves().stream().map(sh -> {
                Map<String, Object> shm = new LinkedHashMap<>();
                shm.put("id", sh.id());
                shm.put("kind", sh.kind());
                shm.put("slots", sh.slots().stream().map(sl -> {
                    Map<String, Object> slm = new LinkedHashMap<>();
                    if (sl.productId() != null) slm.put("productId", sl.productId());
                    if (sl.department() != null) slm.put("department", sl.department());
                    if (sl.label() != null) slm.put("label", sl.label());
                    slm.put("share", Math.round(sl.share() * 10000) / 10000.0);
                    if (sl.facings() != null) slm.put("facings", sl.facings());
                    return slm;
                }).toList());
                return shm;
            }).toList());
            return mm;
        }).toList());
        return out;
    }

    private static String cut(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
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
