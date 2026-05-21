package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.ProductRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Co-purchase analysis: identifica quais produtos são comprados juntos no mesmo cupom.
 *
 * Algoritmo:
 *   1. SQL puro — junta invoice_items com ele mesmo por invoice_id para gerar
 *      todos os pares (A, B) onde A.product_id < B.product_id no mesmo cupom.
 *      Isso é O(items²/cupom) feito inteiramente no banco, sem carregar dados na memória.
 *   2. Filtra pares com pelo menos MIN_PAIR_COUNT co-ocorrências absolutas.
 *   3. Calcula support, confidence (A→B e B→A), lift e leverage para cada par.
 *   4. Filtra lift > 1.0 (par ocorre mais do que o esperado ao acaso).
 *   5. Ordena por pair_count desc (frequência absoluta) como critério principal,
 *      depois lift desc — garante que "Coca + Salgadinho" apareça antes de pares raros
 *      com lift alto por puro acaso estatístico.
 *
 * Janela de análise: 90 dias (configurável via MIN_PAIR_COUNT).
 * Cache TTL: 10 minutos, invalidado a cada nova nota recebida.
 */
@Service
public class MarketBasketService {

    private static final Duration CACHE_TTL = Duration.ofMinutes(10);

    /** Número mínimo absoluto de co-ocorrências para um par ser considerado relevante. */
    private static final int MIN_PAIR_COUNT = 3;

    /** Janela de análise em dias. */
    private static final int WINDOW_DAYS = 90;

    /** Número máximo de regras retornadas (evita payloads gigantes). */
    private static final int MAX_RULES = 200;

    @Autowired private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired private ProductRepository productRepository;

    private final ConcurrentHashMap<UUID, CacheEntry> cache = new ConcurrentHashMap<>();

    public List<MarketBasketDTO> analyzeMarketBasket(UUID marketId, double minSupport, double minConfidence) {
        CacheEntry cached = cache.get(marketId);
        if (cached != null && !cached.isExpired()) {
            return cached.rules;
        }
        List<MarketBasketDTO> rules = computeRules(marketId, minConfidence);
        cache.put(marketId, new CacheEntry(rules));
        return rules;
    }

    public void invalidate(UUID marketId) {
        cache.remove(marketId);
    }

    // ── Core SQL computation ──────────────────────────────────────────────────

    private List<MarketBasketDTO> computeRules(UUID marketId, double minConfidence) {
        LocalDateTime since = LocalDateTime.now().minusDays(WINDOW_DAYS);

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("since", since)
            .addValue("minPairCount", MIN_PAIR_COUNT);

        /*
         * CTE basket_items: produtos distintos por cupom na janela de análise.
         *   (deduplicamos por product_id dentro do mesmo cupom para evitar
         *    inflar a contagem quando o mesmo EAN aparece em múltiplas linhas)
         *
         * CTE pairs: todos os pares ordenados (A < B) presentes no mesmo cupom.
         *
         * CTE pair_counts: frequência absoluta de cada par + total de cupons.
         *
         * CTE item_counts: em quantos cupons cada produto aparece individualmente.
         *
         * SELECT final: support, confidence A→B, confidence B→A, lift, leverage.
         */
        String sql =
            "with basket_items as ( " +
            "    select distinct i.id as invoice_id, it.product_id " +
            "    from invoice_items it " +
            "    join invoices i on i.id = it.invoice_id " +
            "    where i.market_id = :marketId " +
            "      and i.data_emissao >= :since " +
            "      and it.product_id is not null " +
            "), " +
            "total_baskets as ( " +
            "    select count(distinct invoice_id) as n from basket_items " +
            "), " +
            "pairs as ( " +
            "    select a.invoice_id, a.product_id as product_a, b.product_id as product_b " +
            "    from basket_items a " +
            "    join basket_items b on a.invoice_id = b.invoice_id " +
            "                       and a.product_id < b.product_id " +
            "), " +
            "pair_counts as ( " +
            "    select product_a, product_b, count(*) as pair_count " +
            "    from pairs " +
            "    group by product_a, product_b " +
            "    having count(*) >= :minPairCount " +
            "), " +
            "item_counts as ( " +
            "    select product_id, count(distinct invoice_id) as item_count " +
            "    from basket_items " +
            "    group by product_id " +
            ") " +
            "select " +
            "    pc.product_a, " +
            "    pc.product_b, " +
            "    pc.pair_count, " +
            "    tb.n as total_baskets, " +
            "    ia.item_count as count_a, " +
            "    ib.item_count as count_b, " +
            "    cast(pc.pair_count as double precision) / tb.n as support, " +
            "    cast(pc.pair_count as double precision) / ia.item_count as conf_ab, " +
            "    cast(pc.pair_count as double precision) / ib.item_count as conf_ba, " +
            "    (cast(pc.pair_count as double precision) / tb.n) " +
            "        / ((cast(ia.item_count as double precision) / tb.n) " +
            "           * (cast(ib.item_count as double precision) / tb.n)) as lift, " +
            "    (cast(pc.pair_count as double precision) / tb.n) " +
            "        - (cast(ia.item_count as double precision) / tb.n) " +
            "          * (cast(ib.item_count as double precision) / tb.n) as leverage " +
            "from pair_counts pc " +
            "join item_counts ia on ia.product_id = pc.product_a " +
            "join item_counts ib on ib.product_id = pc.product_b " +
            "cross join total_baskets tb " +
            "where (cast(pc.pair_count as double precision) / tb.n) " +
            "          / ((cast(ia.item_count as double precision) / tb.n) " +
            "             * (cast(ib.item_count as double precision) / tb.n)) > 1.0 " +
            "order by pc.pair_count desc, lift desc " +
            "limit 500";

        // Cada linha do resultado gera duas regras: A→B e B→A
        List<MarketBasketDTO> rules = new ArrayList<>();
        jdbcTemplate.query(sql, params, rs -> {
            UUID a = toUUID(rs.getObject("product_a"));
            UUID b = toUUID(rs.getObject("product_b"));
            int pairCount = rs.getInt("pair_count");
            long totalBaskets = rs.getLong("total_baskets");
            double support = rs.getDouble("support");
            double confAB = rs.getDouble("conf_ab");
            double confBA = rs.getDouble("conf_ba");
            double lift = rs.getDouble("lift");
            double leverage = rs.getDouble("leverage");

            // Regra A → B
            MarketBasketDTO rAB = new MarketBasketDTO();
            rAB.setAntecedent(List.of(a));
            rAB.setConsequent(List.of(b));
            rAB.setSupport(support);
            rAB.setConfidence(confAB);
            rAB.setLift(lift);
            rAB.setLeverage(leverage);
            rAB.setPairCount(pairCount);
            rules.add(rAB);

            // Regra B → A (confidence invertida, demais métricas iguais)
            MarketBasketDTO rBA = new MarketBasketDTO();
            rBA.setAntecedent(List.of(b));
            rBA.setConsequent(List.of(a));
            rBA.setSupport(support);
            rBA.setConfidence(confBA);
            rBA.setLift(lift);
            rBA.setLeverage(leverage);
            rBA.setPairCount(pairCount);
            rules.add(rBA);
        });

        // Ordena pela regra mais forte: pair_count desc, depois lift desc
        rules.sort(Comparator
            .comparingInt(MarketBasketDTO::getPairCount).reversed()
            .thenComparingDouble(MarketBasketDTO::getLift).reversed()
            .thenComparingDouble(MarketBasketDTO::getConfidence).reversed()
        );

        List<MarketBasketDTO> top = rules.stream().limit(MAX_RULES).collect(Collectors.toList());
        enrichWithNames(top);
        return top;
    }

    private void enrichWithNames(List<MarketBasketDTO> rules) {
        Set<UUID> ids = new HashSet<>();
        for (MarketBasketDTO r : rules) {
            ids.addAll(r.getAntecedent());
            ids.addAll(r.getConsequent());
        }
        if (ids.isEmpty()) return;

        Map<UUID, String> names = productRepository.findAllById(ids).stream()
            .collect(Collectors.toMap(Product::getId, Product::getName));

        for (MarketBasketDTO r : rules) {
            r.setAntecedentNames(r.getAntecedent().stream().map(id -> names.getOrDefault(id, id.toString())).collect(Collectors.toList()));
            r.setConsequentNames(r.getConsequent().stream().map(id -> names.getOrDefault(id, id.toString())).collect(Collectors.toList()));
        }
    }

    private UUID toUUID(Object value) {
        if (value == null) return null;
        return value instanceof UUID u ? u : UUID.fromString(value.toString());
    }

    // ── Cache ─────────────────────────────────────────────────────────────────

    private static final class CacheEntry {
        final List<MarketBasketDTO> rules;
        final Instant expiresAt;
        CacheEntry(List<MarketBasketDTO> rules) {
            this.rules = rules;
            this.expiresAt = Instant.now().plus(CACHE_TTL);
        }
        boolean isExpired() { return Instant.now().isAfter(expiresAt); }
    }
}
