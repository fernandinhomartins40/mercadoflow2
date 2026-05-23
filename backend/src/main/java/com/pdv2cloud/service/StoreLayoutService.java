package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.StoreLayout;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.StoreLayoutRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StoreLayoutService {

    @Autowired private StoreLayoutRepository layoutRepository;
    @Autowired private MarketRepository marketRepository;
    @Autowired private MarketBasketService marketBasketService;
    @Autowired private NamedParameterJdbcTemplate jdbc;

    // ── Layout CRUD ──────────────────────────────────────────────────────────

    public Map<String, Object> getLayout(UUID marketId) {
        StoreLayout layout = layoutRepository.findByMarketId(marketId).orElse(null);
        Map<String, Object> result = new LinkedHashMap<>();
        if (layout == null) {
            result.put("gridCols", 4);
            result.put("gridRows", 5);
            result.put("cells", List.of());
        } else {
            result.put("id", layout.getId());
            result.put("gridCols", layout.getGridCols());
            result.put("gridRows", layout.getGridRows());
            result.put("cells", layout.getCells() != null ? layout.getCells() : List.of());
        }
        return result;
    }

    @Transactional
    public Map<String, Object> saveLayout(UUID marketId, int gridCols, int gridRows, List<Map<String, Object>> cells) {
        StoreLayout layout = layoutRepository.findByMarketId(marketId).orElseGet(() -> {
            Market m = marketRepository.findById(marketId)
                .orElseThrow(() -> new IllegalArgumentException("Market not found"));
            StoreLayout l = new StoreLayout();
            l.setMarket(m);
            return l;
        });
        layout.setGridCols(gridCols);
        layout.setGridRows(gridRows);
        layout.setCells(cells);
        layout.setUpdatedAt(LocalDateTime.now());
        StoreLayout saved = layoutRepository.save(layout);
        return getLayout(marketId);
    }

    // ── Category revenue heatmap (last 30 days) ──────────────────────────────

    public List<Map<String, Object>> getCategoryHeatmap(UUID marketId) {
        LocalDate since = LocalDate.now().minusDays(30);
        String sql =
            "select coalesce(p.category, 'Sem categoria') as category, " +
            "       sum(ii.quantity * ii.unit_price) as revenue, " +
            "       sum(ii.quantity) as quantity, " +
            "       count(distinct i.id) as transactions " +
            "from invoice_items ii " +
            "join invoices i on i.id = ii.invoice_id " +
            "join products p on p.id = ii.product_id " +
            "where i.market_id = :marketId " +
            "  and i.data_emissao >= :since " +
            "  and ii.product_id is not null " +
            "group by coalesce(p.category, 'Sem categoria') " +
            "order by revenue desc";

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("since", since);

        List<Map<String, Object>> rows = new ArrayList<>();
        jdbc.query(sql, params, rs -> {
            Map<String, Object> row = new HashMap<>();
            row.put("category", rs.getString("category"));
            row.put("revenue", rs.getBigDecimal("revenue"));
            row.put("quantity", rs.getLong("quantity"));
            row.put("transactions", rs.getLong("transactions"));
            rows.add(row);
        });

        // Normalize to 0–100 score
        BigDecimal maxRev = rows.stream()
            .map(r -> (BigDecimal) r.get("revenue"))
            .filter(v -> v != null)
            .max(BigDecimal::compareTo)
            .orElse(BigDecimal.ONE);
        if (maxRev.compareTo(BigDecimal.ZERO) == 0) maxRev = BigDecimal.ONE;

        for (Map<String, Object> row : rows) {
            BigDecimal rev = (BigDecimal) row.get("revenue");
            if (rev == null) rev = BigDecimal.ZERO;
            int score = rev.multiply(BigDecimal.valueOf(100))
                .divide(maxRev, 0, java.math.RoundingMode.HALF_UP)
                .intValue();
            row.put("score", score);
            // heat tier: hot ≥66, warm 33–65, cold <33
            row.put("heat", score >= 66 ? "hot" : score >= 33 ? "warm" : "cold");
        }
        return rows;
    }

    // ── Neighbor combo insights ───────────────────────────────────────────────
    // Given the current layout cells, finds market basket rules where
    // antecedent and consequent categories are placed in adjacent cells.

    public List<Map<String, Object>> getNeighborInsights(UUID marketId, List<Map<String, Object>> cells, int gridCols) {
        List<MarketBasketDTO> rules = marketBasketService.analyzeMarketBasket(marketId, 0.005, 0.05);
        if (rules == null || rules.isEmpty()) return List.of();

        // Build categorySlug → cell position map
        Map<String, int[]> catPos = new HashMap<>(); // slug → [row, col]
        for (Map<String, Object> cell : cells) {
            String slug = (String) cell.get("categorySlug");
            if (slug == null || slug.isBlank()) continue;
            Object rowObj = cell.get("row");
            Object colObj = cell.get("col");
            if (rowObj == null || colObj == null) continue;
            catPos.put(slug.toLowerCase(), new int[]{ toInt(rowObj), toInt(colObj) });
        }

        // Build categorySlug → top products map from basket rules
        // antecedentNames/consequentNames carry product names; we need categories
        // Use a SQL query to get category per product from the basket rule product IDs
        Map<UUID, String> productCategory = getProductCategories(marketId);

        List<Map<String, Object>> insights = new ArrayList<>();

        for (MarketBasketDTO rule : rules) {
            if (rule.getAntecedent() == null || rule.getConsequent() == null) continue;
            UUID antId = rule.getAntecedent().isEmpty() ? null : rule.getAntecedent().get(0);
            UUID conId = rule.getConsequent().isEmpty() ? null : rule.getConsequent().get(0);
            if (antId == null || conId == null) continue;

            String catA = productCategory.getOrDefault(antId, "").toLowerCase();
            String catB = productCategory.getOrDefault(conId, "").toLowerCase();
            if (catA.isBlank() || catB.isBlank() || catA.equals(catB)) continue;

            int[] posA = catPos.get(catA);
            int[] posB = catPos.get(catB);

            String adjacency;
            if (posA != null && posB != null) {
                boolean adjacent = isAdjacent(posA, posB);
                adjacency = adjacent ? "adjacent" : "far";
            } else {
                adjacency = "unmapped";
            }

            // Only include rules with meaningful lift and confidence
            if (rule.getLift() < 1.3 || rule.getPairCount() < 3) continue;

            Map<String, Object> insight = new HashMap<>();
            insight.put("antecedentName", rule.getAntecedentNames() != null && !rule.getAntecedentNames().isEmpty()
                ? rule.getAntecedentNames().get(0) : antId.toString());
            insight.put("consequentName", rule.getConsequentNames() != null && !rule.getConsequentNames().isEmpty()
                ? rule.getConsequentNames().get(0) : conId.toString());
            insight.put("antecedentCategory", catA);
            insight.put("consequentCategory", catB);
            insight.put("confidence", rule.getConfidence());
            insight.put("lift", rule.getLift());
            insight.put("pairCount", rule.getPairCount());
            insight.put("adjacency", adjacency);
            insight.put("posA", posA);
            insight.put("posB", posB);
            insights.add(insight);

            if (insights.size() >= 30) break;
        }
        return insights;
    }

    private Map<UUID, String> getProductCategories(UUID marketId) {
        String sql =
            "select distinct p.id, coalesce(p.category, '') as category " +
            "from products p " +
            "join invoice_items ii on ii.product_id = p.id " +
            "join invoices i on i.id = ii.invoice_id " +
            "where i.market_id = :marketId";
        Map<UUID, String> result = new HashMap<>();
        jdbc.query(sql, new MapSqlParameterSource("marketId", marketId), rs -> {
            result.put(UUID.fromString(rs.getString("id")), rs.getString("category"));
        });
        return result;
    }

    private boolean isAdjacent(int[] a, int[] b) {
        int dr = Math.abs(a[0] - b[0]);
        int dc = Math.abs(a[1] - b[1]);
        return (dr <= 1 && dc == 0) || (dr == 0 && dc <= 1);
    }

    private int toInt(Object v) {
        if (v instanceof Number n) return n.intValue();
        return Integer.parseInt(v.toString());
    }
}
