package com.pdv2cloud.service.storemap;

import com.pdv2cloud.service.storemap.StoreMapService.DepartmentPair;
import com.pdv2cloud.service.storemap.StoreMapService.DepartmentStat;
import com.pdv2cloud.service.storemap.StoreMapService.DepartmentsReport;
import com.pdv2cloud.service.storemap.StorePlan.Fixture;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Sugestões de arrumação a partir da planta e das vendas.
 *
 * Cada regra é uma prática consolidada de varejo, aplicada com os números da
 * própria loja e explicada em uma frase:
 * <ul>
 *   <li>PLACE — setor que vende e ainda não tem lugar no mapa;</li>
 *   <li>COLD — setor de frio em móvel seco;</li>
 *   <li>CLOSER — setores que o cliente leva juntos, em lados opostos da loja;</li>
 *   <li>MAGNET — setor de destino colado na entrada (no fundo, puxa o cliente
 *       pela loja inteira);</li>
 *   <li>SLOW_SPOT — móvel que vende pouco em lugar de passagem;</li>
 *   <li>END_CAP — o que pôr nas pontas de gôndola;</li>
 *   <li>EMPTY — móveis sem setor definido.</li>
 * </ul>
 */
public final class StoreMapInsights {

    public record Insight(String kind, int priority, String title, String text,
                          List<String> departments, List<String> fixtureIds) {}

    /** Participação mínima no faturamento para cobrar lugar no mapa. */
    static final double PLACE_MIN_SHARE = 0.02;
    /** Afinidade mínima (quantas vezes acima do acaso) para sugerir aproximar. */
    static final double CLOSER_MIN_LIFT = 1.3;
    /** "Longe": acima desta fração da diagonal da loja. */
    static final double FAR = 0.45;
    /** "Perto da entrada": abaixo desta fração da diagonal. */
    static final double NEAR_ENTRANCE = 0.3;

    private static final Locale PT = Locale.forLanguageTag("pt-BR");

    private StoreMapInsights() {}

    public static List<Insight> build(StorePlan plan, DepartmentsReport report, List<String> endCapCandidates) {
        List<Insight> out = new ArrayList<>();
        Map<StoreDepartment, DepartmentStat> stats = new EnumMap<>(StoreDepartment.class);
        for (DepartmentStat s : report.departments()) stats.put(StoreDepartment.valueOf(s.key()), s);
        double diag = plan.diagonal();
        double[] entrance = plan.entrance();

        // PLACE
        for (DepartmentStat s : report.departments()) {
            StoreDepartment d = StoreDepartment.valueOf(s.key());
            if (d == StoreDepartment.OUTROS || s.revenueShare() < PLACE_MIN_SHARE) continue;
            if (plan.fixturesWith(d).isEmpty()) {
                out.add(new Insight("PLACE", 90, "Onde fica " + d.label() + "?",
                    d.label() + " é " + pct(s.revenueShare()) + " do que a loja vende e ainda não tem lugar no mapa. "
                        + "Toque no móvel onde ficam esses produtos e marque o setor.",
                    List.of(d.name()), List.of()));
            }
        }

        // COLD
        for (Fixture f : plan.fixtures()) {
            if (StorePlan.COLD_TYPES.contains(f.type())) continue;
            for (StoreDepartment d : f.departments()) {
                if (!d.cold()) continue;
                out.add(new Insight("COLD", 85, d.label() + " fora da refrigeração",
                    d.label() + " está marcado em " + describe(f) + ", que não é refrigerado. "
                        + "Se for isso mesmo, mude o tipo do móvel para geladeira, freezer ou balcão.",
                    List.of(d.name()), List.of(f.id())));
            }
        }

        // CLOSER
        int closer = 0;
        for (DepartmentPair p : report.pairs()) {
            if (closer >= 4) break;
            if (p.lift() < CLOSER_MIN_LIFT) continue;
            if (p.together() < Math.max(5, report.invoices() * 0.02)) continue;
            StoreDepartment a = StoreDepartment.valueOf(p.a());
            StoreDepartment b = StoreDepartment.valueOf(p.b());
            if (a == StoreDepartment.OUTROS || b == StoreDepartment.OUTROS) continue;
            Fixture[] nearest = nearestPair(plan.fixturesWith(a), plan.fixturesWith(b));
            if (nearest == null) continue;
            double dist = nearest[0].distanceTo(nearest[1]);
            if (dist < FAR * diag) continue;
            DepartmentStat sa = stats.get(a);
            double shareWithB = sa != null && sa.baskets() > 0 ? (double) p.together() / sa.baskets() : 0;
            out.add(new Insight("CLOSER", 70 + Math.min(15, (int) Math.round(p.lift() * 3)),
                "Aproxime " + a.label() + " e " + b.label(),
                (shareWithB > 0 ? "Em " + pct(shareWithB) + " das compras com " + a.label().toLowerCase(PT) + " " : "Com frequência ")
                    + "o cliente também leva " + b.label().toLowerCase(PT) + " (" + dec(p.lift()) + "× mais que o acaso), "
                    + "mas estão a uns " + Math.round(dist) + " m um do outro. Aproxime os dois ou faça um ponto extra de "
                    + b.label().toLowerCase(PT) + " perto de " + a.label().toLowerCase(PT) + ".",
                List.of(a.name(), b.name()), List.of(nearest[0].id(), nearest[1].id())));
            closer++;
        }

        // MAGNET
        if (plan.fixtures().size() >= 3) {
            for (StoreDepartment d : StoreDepartment.values()) {
                if (!d.magnet() || !stats.containsKey(d)) continue;
                List<Fixture> fs = plan.fixturesWith(d);
                if (fs.isEmpty()) continue;
                Fixture closest = fs.stream()
                    .min(Comparator.comparingDouble(f -> f.distanceTo(entrance[0], entrance[1]))).orElseThrow();
                if (closest.distanceTo(entrance[0], entrance[1]) >= NEAR_ENTRANCE * diag) continue;
                out.add(new Insight("MAGNET", 60, "Leve " + d.label() + " para o fundo",
                    d.label() + " é setor de destino: o cliente vai até ele de propósito. Colado na entrada, ele compra e sai; "
                        + "no fundo da loja, passa pelos corredores e leva mais coisas no caminho.",
                    List.of(d.name()), List.of(closest.id())));
            }
        }

        // SLOW_SPOT
        Map<String, Double> fixtureRevenue = revenuePerFixture(plan, stats);
        List<Double> values = fixtureRevenue.values().stream().filter(v -> v > 0).sorted().toList();
        if (values.size() >= 4) {
            double median = values.get(values.size() / 2);
            plan.fixtures().stream()
                .filter(f -> fixtureRevenue.containsKey(f.id()))
                .filter(f -> fixtureRevenue.get(f.id()) < median * 0.25)
                .filter(f -> f.distanceTo(entrance[0], entrance[1]) < 0.4 * diag)
                .limit(2)
                .forEach(f -> out.add(new Insight("SLOW_SPOT", 50, describeCap(f) + " vende pouco num lugar de passagem",
                    "Fica perto da entrada, onde todo cliente passa, mas vende menos de um quarto do que um móvel típico da loja. "
                        + "Vale usar para promoção ou produto de impulso e levar o que está ali para um lugar menos nobre.",
                    f.departments().stream().map(Enum::name).toList(), List.of(f.id()))));
        }

        // END_CAP
        List<Fixture> endCaps = plan.fixtures().stream().filter(f -> "ponta".equals(f.type())).toList();
        if (!endCapCandidates.isEmpty()) {
            String names = String.join(", ", endCapCandidates);
            out.add(new Insight("END_CAP", endCaps.isEmpty() ? 45 : 40,
                endCaps.isEmpty() ? "Crie pontas de gôndola" : "O que pôr nas pontas de gôndola",
                "A ponta de gôndola é o lugar mais visto da loja. Os produtos que mais puxam outras compras junto aqui são: "
                    + names + "." + (endCaps.isEmpty() ? " Adicione pontas no fim dos corredores para expor esses itens." : ""),
                List.of(), endCaps.stream().map(Fixture::id).toList()));
        }

        // EMPTY
        List<Fixture> empty = plan.fixtures().stream()
            .filter(f -> !StorePlan.NON_PRODUCT_TYPES.contains(f.type()) && f.departments().isEmpty()).toList();
        if (!empty.isEmpty()) {
            out.add(new Insight("EMPTY", 30,
                empty.size() == 1 ? "1 móvel sem setor" : empty.size() + " móveis sem setor",
                "Toque neles e diga o que é vendido ali. Com isso o calor de vendas e as sugestões ficam completos.",
                List.of(), empty.stream().map(Fixture::id).toList()));
        }

        out.sort(Comparator.comparingInt(Insight::priority).reversed());
        return out;
    }

    /** Faturamento do período por móvel: o de cada setor dividido entre os móveis que o expõem. */
    static Map<String, Double> revenuePerFixture(StorePlan plan, Map<StoreDepartment, DepartmentStat> stats) {
        Map<StoreDepartment, Integer> count = new EnumMap<>(StoreDepartment.class);
        for (Fixture f : plan.fixtures()) for (StoreDepartment d : f.departments()) count.merge(d, 1, Integer::sum);
        Map<String, Double> out = new HashMap<>();
        for (Fixture f : plan.fixtures()) {
            if (f.departments().isEmpty()) continue;
            double v = 0;
            for (StoreDepartment d : f.departments()) {
                DepartmentStat s = stats.get(d);
                if (s != null) v += s.revenue().doubleValue() / count.get(d);
            }
            out.put(f.id(), v);
        }
        return out;
    }

    private static Fixture[] nearestPair(List<Fixture> as, List<Fixture> bs) {
        Fixture[] best = null;
        double bestD = Double.MAX_VALUE;
        for (Fixture a : as) for (Fixture b : bs) {
            if (a == b) return null; // mesmo móvel: já estão juntos
            double d = a.distanceTo(b);
            if (d < bestD) { bestD = d; best = new Fixture[] {a, b}; }
        }
        return best;
    }

    private static String describe(Fixture f) {
        String name = f.label() == null || f.label().isBlank() ? typeLabel(f.type()) : f.label();
        return "\"" + name + "\"";
    }

    private static String describeCap(Fixture f) {
        return f.label() == null || f.label().isBlank() ? typeLabel(f.type()) : f.label();
    }

    private static String typeLabel(String type) {
        return switch (type) {
            case "gondola" -> "Gôndola";
            case "ponta" -> "Ponta de gôndola";
            case "geladeira" -> "Geladeira";
            case "freezer" -> "Freezer";
            case "ilha" -> "Ilha";
            case "banca" -> "Banca";
            case "balcao" -> "Balcão";
            default -> "Móvel";
        };
    }

    private static String pct(double share) {
        return Math.max(1, Math.round(share * 100)) + "%";
    }

    private static String dec(double v) {
        NumberFormat nf = NumberFormat.getNumberInstance(PT);
        nf.setMaximumFractionDigits(1);
        nf.setMinimumFractionDigits(1);
        return nf.format(v);
    }
}
