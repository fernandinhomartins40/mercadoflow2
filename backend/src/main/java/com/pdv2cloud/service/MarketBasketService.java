package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.entity.Invoice;
import com.pdv2cloud.model.entity.InvoiceItem;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.InvoiceRepository;
import com.pdv2cloud.repository.ProductRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Market basket analysis using Apriori pair-association with:
 * - Leverage metric (sensitivity to high-frequency items)
 * - Normalized lift score for ranking
 * - Per-market in-memory TTL cache (5 min) to avoid re-computing on every cockpit load
 */
@Service
public class MarketBasketService {

    private static final Duration CACHE_TTL = Duration.ofMinutes(5);

    @Autowired private InvoiceRepository invoiceRepository;
    @Autowired private ProductRepository productRepository;

    private final ConcurrentHashMap<UUID, CacheEntry> cache = new ConcurrentHashMap<>();

    public List<MarketBasketDTO> analyzeMarketBasket(UUID marketId, double minSupport, double minConfidence) {
        CacheEntry cached = cache.get(marketId);
        if (cached != null && !cached.isExpired()) {
            return cached.rules;
        }
        List<MarketBasketDTO> rules = computeRules(marketId, minSupport, minConfidence);
        cache.put(marketId, new CacheEntry(rules));
        return rules;
    }

    /** Invalidate the cache for a market (called when new invoices are ingested). */
    public void invalidate(UUID marketId) {
        cache.remove(marketId);
    }

    // ── Core computation ─────────────────────────────────────────────────────

    private List<MarketBasketDTO> computeRules(UUID marketId, double minSupport, double minConfidence) {
        List<Transaction> transactions = getTransactions(marketId);
        if (transactions.isEmpty()) return List.of();

        int n = transactions.size();
        Map<UUID, Integer> itemCounts = countItems(transactions);
        Map<Set<UUID>, Integer> freqPairs = generateFrequentPairs(transactions, minSupport, n);
        if (freqPairs.isEmpty()) return List.of();

        List<MarketBasketDTO> rules = generateRules(freqPairs, itemCounts, n, minConfidence);
        rules.forEach(rule -> enrichMetrics(rule, freqPairs, itemCounts, n));

        List<MarketBasketDTO> filtered = rules.stream()
            .filter(r -> r.getLift() > 1.0 && r.getLeverage() > 0)
            .sorted(Comparator
                .comparingDouble(MarketBasketDTO::getLift).reversed()
                .thenComparingDouble(MarketBasketDTO::getConfidence).reversed()
            )
            .collect(Collectors.toList());

        enrichWithNames(filtered);
        return filtered;
    }

    private List<Transaction> getTransactions(UUID marketId) {
        java.time.LocalDateTime since = java.time.LocalDateTime.now().minusDays(30);
        List<Invoice> invoices = invoiceRepository.findRecentInvoices(marketId, since);
        List<Transaction> transactions = new ArrayList<>();
        for (Invoice invoice : invoices) {
            Set<UUID> ids = new HashSet<>();
            for (InvoiceItem item : invoice.getItems()) {
                if (item.getProduct() != null) ids.add(item.getProduct().getId());
            }
            if (!ids.isEmpty()) transactions.add(new Transaction(new ArrayList<>(ids)));
        }
        return transactions;
    }

    private Map<UUID, Integer> countItems(List<Transaction> txs) {
        Map<UUID, Integer> counts = new HashMap<>();
        for (Transaction tx : txs) {
            for (UUID id : tx.productIds) counts.merge(id, 1, Integer::sum);
        }
        return counts;
    }

    private Map<Set<UUID>, Integer> generateFrequentPairs(List<Transaction> txs, double minSupport, int n) {
        Map<Set<UUID>, Integer> pairs = new HashMap<>();
        int minCount = (int) Math.max(1, Math.ceil(n * minSupport));
        for (Transaction tx : txs) {
            List<UUID> products = tx.productIds;
            for (int i = 0; i < products.size(); i++) {
                for (int j = i + 1; j < products.size(); j++) {
                    pairs.merge(Set.of(products.get(i), products.get(j)), 1, Integer::sum);
                }
            }
        }
        pairs.entrySet().removeIf(e -> e.getValue() < minCount);
        return pairs;
    }

    private List<MarketBasketDTO> generateRules(
        Map<Set<UUID>, Integer> pairs,
        Map<UUID, Integer> itemCounts,
        int n,
        double minConfidence
    ) {
        List<MarketBasketDTO> rules = new ArrayList<>();
        for (Map.Entry<Set<UUID>, Integer> entry : pairs.entrySet()) {
            List<UUID> items = new ArrayList<>(entry.getKey());
            if (items.size() != 2) continue;
            UUID a = items.get(0), b = items.get(1);

            double confAB = confidence(a, b, pairs, itemCounts);
            if (confAB >= minConfidence) {
                rules.add(rule(a, b, confAB, (double) entry.getValue() / n, entry.getValue()));
            }
            double confBA = confidence(b, a, pairs, itemCounts);
            if (confBA >= minConfidence) {
                rules.add(rule(b, a, confBA, (double) entry.getValue() / n, entry.getValue()));
            }
        }
        return rules;
    }

    private MarketBasketDTO rule(UUID ant, UUID cons, double conf, double support, int pairCount) {
        MarketBasketDTO r = new MarketBasketDTO();
        r.setAntecedent(List.of(ant));
        r.setConsequent(List.of(cons));
        r.setSupport(support);
        r.setConfidence(conf);
        r.setPairCount(pairCount);
        return r;
    }

    private double confidence(UUID a, UUID b, Map<Set<UUID>, Integer> pairs, Map<UUID, Integer> itemCounts) {
        int pairCount = pairs.getOrDefault(Set.of(a, b), 0);
        int countA = itemCounts.getOrDefault(a, 0);
        return countA == 0 ? 0 : (double) pairCount / countA;
    }

    private void enrichMetrics(MarketBasketDTO rule, Map<Set<UUID>, Integer> pairs, Map<UUID, Integer> itemCounts, int n) {
        if (rule.getAntecedent().isEmpty() || rule.getConsequent().isEmpty()) {
            rule.setLift(0);
            rule.setLeverage(0);
            return;
        }
        UUID a = rule.getAntecedent().get(0);
        UUID b = rule.getConsequent().get(0);
        int pairCount = pairs.getOrDefault(Set.of(a, b), 0);
        int countA = itemCounts.getOrDefault(a, 0);
        int countB = itemCounts.getOrDefault(b, 0);
        if (countA == 0 || countB == 0) { rule.setLift(0); rule.setLeverage(0); return; }

        double supportAB = (double) pairCount / n;
        double supportA = (double) countA / n;
        double supportB = (double) countB / n;
        double lift = supportAB / (supportA * supportB);
        double leverage = supportAB - (supportA * supportB); // P(A∩B) - P(A)·P(B)

        rule.setLift(lift);
        rule.setLeverage(leverage);
    }

    private void enrichWithNames(List<MarketBasketDTO> rules) {
        Set<UUID> ids = new HashSet<>();
        for (MarketBasketDTO r : rules) { ids.addAll(r.getAntecedent()); ids.addAll(r.getConsequent()); }
        Map<UUID, String> names = productRepository.findAllById(ids).stream()
            .collect(Collectors.toMap(Product::getId, Product::getName));
        for (MarketBasketDTO r : rules) {
            r.setAntecedentNames(r.getAntecedent().stream().map(names::get).collect(Collectors.toList()));
            r.setConsequentNames(r.getConsequent().stream().map(names::get).collect(Collectors.toList()));
        }
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

    private record Transaction(List<UUID> productIds) {}
}
