package com.pdv2cloud.service.storemap;

import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.StoreLayout;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.StoreLayoutRepository;
import com.pdv2cloud.service.MarketBasketService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Loja Viva: a planta da loja com cada produto localizado sozinho.
 *
 * O dono diz em que móvel fica cada setor; o sistema sabe o setor de cada
 * produto vendido pelo NCM da nota ({@link DepartmentClassifier}). Com isso dá
 * para responder "onde fica?", pintar o calor de vendas por móvel e sugerir
 * mudanças com base no que o cliente leva junto.
 */
@Service
public class StoreMapService {

    public static final int WINDOW_DAYS = 30;
    private static final int TOP_PRODUCTS = 8;
    private static final int MAX_FIXTURES = 400;

    private final NamedParameterJdbcTemplate jdbc;
    private final StoreLayoutRepository layoutRepository;
    private final MarketRepository marketRepository;
    private final MarketBasketService marketBasketService;

    public StoreMapService(
        NamedParameterJdbcTemplate jdbc,
        StoreLayoutRepository layoutRepository,
        MarketRepository marketRepository,
        MarketBasketService marketBasketService
    ) {
        this.jdbc = jdbc;
        this.layoutRepository = layoutRepository;
        this.marketRepository = marketRepository;
        this.marketBasketService = marketBasketService;
    }

    // ── Relatório de setores ────────────────────────────────────────────────

    public record TopProduct(UUID id, String name, String imageUrl, BigDecimal revenue) {}

    public record DepartmentStat(
        String key, String label, boolean magnet, boolean cold,
        BigDecimal revenue, double revenueShare, int baskets, double basketShare,
        int productCount, List<TopProduct> topProducts) {}

    /** Dois setores na mesma compra: {@code together} compras; {@code lift} > 1 = mais que o acaso. */
    public record DepartmentPair(String a, String b, int together, double lift) {}

    public record DepartmentsReport(
        int days, int invoices, BigDecimal revenue,
        List<DepartmentStat> departments, List<DepartmentPair> pairs) {}

    @Transactional(readOnly = true)
    public DepartmentsReport departments(UUID marketId) {
        StoreDepartment[] all = StoreDepartment.values();
        Map<StoreDepartment, BigDecimal> revenue = new EnumMap<>(StoreDepartment.class);
        Map<StoreDepartment, Integer> baskets = new EnumMap<>(StoreDepartment.class);
        Map<UUID, Integer> invoiceMask = new HashMap<>();
        Map<UUID, BigDecimal> productRevenue = new HashMap<>();
        Map<UUID, StoreDepartment> productDept = new HashMap<>();
        Map<String, StoreDepartment> cache = new HashMap<>();

        // Uma passada pelos itens do período, agregando em memória: para cada
        // nota, o conjunto de setores (bitmask) — base da afinidade entre setores.
        String sql =
            "select ii.invoice_id, ii.product_id, ii.ncm, p.category, ii.valor_total " +
            "from invoice_items ii " +
            "join invoices i on i.id = ii.invoice_id " +
            "left join products p on p.id = ii.product_id " +
            "where i.market_id = :marketId and i.data_emissao >= :since";
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("since", LocalDate.now().minusDays(WINDOW_DAYS).atStartOfDay());

        jdbc.query(sql, params, rs -> {
            String ncm = rs.getString("ncm");
            String category = rs.getString("category");
            StoreDepartment dept = cache.computeIfAbsent(
                (ncm == null ? "" : ncm) + "|" + (category == null ? "" : category),
                k -> DepartmentClassifier.classify(ncm, category));
            BigDecimal value = rs.getBigDecimal("valor_total");
            if (value == null) value = BigDecimal.ZERO;
            revenue.merge(dept, value, BigDecimal::add);
            UUID invoiceId = (UUID) rs.getObject("invoice_id");
            invoiceMask.merge(invoiceId, 1 << dept.ordinal(), (x, y) -> x | y);
            Object pid = rs.getObject("product_id");
            if (pid != null) {
                UUID productId = (UUID) pid;
                productRevenue.merge(productId, value, BigDecimal::add);
                productDept.putIfAbsent(productId, dept);
            }
        });

        int invoices = invoiceMask.size();
        int[][] together = new int[all.length][all.length];
        for (int mask : invoiceMask.values()) {
            for (int a = 0; a < all.length; a++) {
                if ((mask & (1 << a)) == 0) continue;
                baskets.merge(all[a], 1, Integer::sum);
                for (int b = a + 1; b < all.length; b++) {
                    if ((mask & (1 << b)) != 0) together[a][b]++;
                }
            }
        }

        BigDecimal total = revenue.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<StoreDepartment, List<UUID>> productsByDept = new EnumMap<>(StoreDepartment.class);
        productDept.forEach((pid, d) -> productsByDept.computeIfAbsent(d, k -> new ArrayList<>()).add(pid));
        Map<StoreDepartment, List<UUID>> topIds = new EnumMap<>(StoreDepartment.class);
        Set<UUID> needed = new HashSet<>();
        productsByDept.forEach((d, ids) -> {
            List<UUID> top = ids.stream()
                .sorted(Comparator.comparing((UUID id) -> productRevenue.get(id)).reversed())
                .limit(TOP_PRODUCTS).toList();
            topIds.put(d, top);
            needed.addAll(top);
        });
        Map<UUID, String[]> names = productNames(needed);

        List<DepartmentStat> stats = new ArrayList<>();
        for (StoreDepartment d : all) {
            BigDecimal rev = revenue.getOrDefault(d, BigDecimal.ZERO);
            int b = baskets.getOrDefault(d, 0);
            if (rev.signum() == 0 && b == 0) continue;
            List<TopProduct> tops = topIds.getOrDefault(d, List.of()).stream()
                .map(id -> {
                    String[] n = names.getOrDefault(id, new String[] {"Produto", null});
                    return new TopProduct(id, n[0], n[1], productRevenue.get(id).setScale(2, RoundingMode.HALF_UP));
                }).toList();
            stats.add(new DepartmentStat(d.name(), d.label(), d.magnet(), d.cold(),
                rev.setScale(2, RoundingMode.HALF_UP),
                total.signum() > 0 ? rev.doubleValue() / total.doubleValue() : 0,
                b, invoices > 0 ? (double) b / invoices : 0,
                productsByDept.getOrDefault(d, List.of()).size(), tops));
        }
        stats.sort(Comparator.comparing(DepartmentStat::revenue).reversed());

        List<DepartmentPair> pairs = new ArrayList<>();
        for (int a = 0; a < all.length; a++) {
            for (int b = a + 1; b < all.length; b++) {
                int t = together[a][b];
                int ca = baskets.getOrDefault(all[a], 0);
                int cb = baskets.getOrDefault(all[b], 0);
                if (t < 3 || ca == 0 || cb == 0) continue;
                double lift = (double) t * invoices / ((double) ca * cb);
                pairs.add(new DepartmentPair(all[a].name(), all[b].name(), t, lift));
            }
        }
        pairs.sort(Comparator.comparingDouble((DepartmentPair p) -> p.together() * p.lift()).reversed());

        return new DepartmentsReport(WINDOW_DAYS, invoices, total.setScale(2, RoundingMode.HALF_UP), stats, pairs);
    }

    private Map<UUID, String[]> productNames(Set<UUID> ids) {
        Map<UUID, String[]> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        jdbc.query("select id, name, image_url from products where id in (:ids)",
            new MapSqlParameterSource("ids", ids),
            rs -> { out.put((UUID) rs.getObject("id"), new String[] {rs.getString("name"), rs.getString("image_url")}); });
        return out;
    }

    // ── Onde fica? ──────────────────────────────────────────────────────────

    public record LocatedProduct(UUID id, String name, String imageUrl, String department, String departmentLabel) {}

    /** Produtos vendidos nos últimos 90 dias cujo nome contém o termo, com o setor de cada um. */
    @Transactional(readOnly = true)
    public List<LocatedProduct> locate(UUID marketId, String query) {
        String q = query == null ? "" : query.trim();
        if (q.length() < 2) return List.of();
        String sql =
            "select p.id, p.name, p.image_url, p.category, max(ii.ncm) as ncm, sum(ii.valor_total) as revenue " +
            "from invoice_items ii " +
            "join invoices i on i.id = ii.invoice_id " +
            "join products p on p.id = ii.product_id " +
            "where i.market_id = :marketId and i.data_emissao >= :since " +
            "  and p.name ilike :term " +
            "group by p.id, p.name, p.image_url, p.category " +
            "order by revenue desc limit 12";
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("since", LocalDate.now().minusDays(90).atStartOfDay())
            // % e _ digitados viram texto, não curinga.
            .addValue("term", "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        return jdbc.query(sql, params, (rs, i) -> {
            StoreDepartment d = DepartmentClassifier.classify(rs.getString("ncm"), rs.getString("category"));
            return new LocatedProduct((UUID) rs.getObject("id"), rs.getString("name"),
                rs.getString("image_url"), d.name(), d.label());
        });
    }

    // ── Planta ──────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public Map<String, Object> getPlan(UUID marketId) {
        return layoutRepository.findByMarketId(marketId)
            .map(StoreLayout::getPlan)
            .orElse(null);
    }

    @Transactional
    public Map<String, Object> savePlan(UUID marketId, Map<String, Object> plan) {
        Map<String, Object> clean = StorePlan.sanitize(plan, MAX_FIXTURES);
        StoreLayout layout = layoutRepository.findByMarketId(marketId).orElseGet(() -> {
            Market m = marketRepository.findById(marketId)
                .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
            StoreLayout l = new StoreLayout();
            l.setMarket(m);
            l.setCells(List.of());
            return l;
        });
        layout.setPlan(clean);
        layout.setUpdatedAt(LocalDateTime.now());
        layoutRepository.save(layout);
        return clean;
    }

    // ── Sugestões ───────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<StoreMapInsights.Insight> insights(UUID marketId) {
        Map<String, Object> raw = getPlan(marketId);
        if (raw == null) return List.of();
        StorePlan plan = StorePlan.from(raw);
        DepartmentsReport report = departments(marketId);
        return StoreMapInsights.build(plan, report, endCapCandidates(marketId));
    }

    /**
     * Produtos que mais puxam outras compras junto (regras de cesta): os
     * candidatos naturais para ponta de gôndola, o lugar mais visto da loja.
     */
    private List<String> endCapCandidates(UUID marketId) {
        List<MarketBasketDTO> rules;
        try {
            rules = marketBasketService.analyzeMarketBasket(marketId, 0.005, 0.05);
        } catch (RuntimeException e) {
            return List.of();
        }
        Map<String, Double> score = new LinkedHashMap<>();
        for (MarketBasketDTO r : rules == null ? List.<MarketBasketDTO>of() : rules) {
            if (r.getAntecedentNames() == null || r.getAntecedentNames().isEmpty() || r.getLift() < 1.2) continue;
            score.merge(r.getAntecedentNames().get(0), r.getPairCount() * r.getLift(), Double::sum);
        }
        return score.entrySet().stream()
            .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
            .limit(3).map(Map.Entry::getKey).toList();
    }
}
