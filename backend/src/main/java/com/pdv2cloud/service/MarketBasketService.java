package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.entity.Invoice;
import com.pdv2cloud.model.entity.InvoiceItem;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.InvoiceRepository;
import com.pdv2cloud.repository.ProductRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class MarketBasketService {

    @Autowired
    private InvoiceRepository invoiceRepository;

    @Autowired
    private ProductRepository productRepository;

    public List<MarketBasketDTO> analyzeMarketBasket(UUID marketId, double minSupport, double minConfidence) {
        List<Transaction> transactions = getTransactions(marketId);
        if (transactions.isEmpty()) {
            return List.of();
        }

        Map<UUID, Integer> itemCounts = countItems(transactions);
        Map<Set<UUID>, Integer> itemsets = generateFrequentItemsets(transactions, minSupport);
        List<MarketBasketDTO> rules = generateAssociationRules(itemsets, itemCounts, transactions.size(), minConfidence);

        rules.forEach(rule -> calculateLift(rule, itemsets, itemCounts, transactions.size()));

        List<MarketBasketDTO> filtered = rules.stream()
            .filter(r -> r.getLift() > 1.0)
            .sorted(Comparator.comparing(MarketBasketDTO::getLift).reversed())
            .collect(Collectors.toList());

        enrichWithNames(filtered);
        return filtered;
    }

    private List<Transaction> getTransactions(UUID marketId) {
        LocalDateTime since = LocalDateTime.now().minusDays(30);
        List<Invoice> invoices = invoiceRepository.findRecentInvoices(marketId, since);
        List<Transaction> transactions = new ArrayList<>();

        for (Invoice invoice : invoices) {
            Set<UUID> productIds = new HashSet<>();
            for (InvoiceItem item : invoice.getItems()) {
                if (item.getProduct() != null) {
                    productIds.add(item.getProduct().getId());
                }
            }
            if (!productIds.isEmpty()) {
                transactions.add(new Transaction(new ArrayList<>(productIds)));
            }
        }

        return transactions;
    }

    private Map<Set<UUID>, Integer> generateFrequentItemsets(List<Transaction> transactions, double minSupport) {
        Map<Set<UUID>, Integer> itemsets = new HashMap<>();
        int minCount = (int) Math.ceil(transactions.size() * minSupport);

        for (Transaction tx : transactions) {
            List<UUID> products = tx.getProductIds();
            for (int i = 0; i < products.size(); i++) {
                for (int j = i + 1; j < products.size(); j++) {
                    Set<UUID> pair = Set.of(products.get(i), products.get(j));
                    itemsets.merge(pair, 1, Integer::sum);
                }
            }
        }

        itemsets.entrySet().removeIf(e -> e.getValue() < minCount);
        return itemsets;
    }

    private List<MarketBasketDTO> generateAssociationRules(Map<Set<UUID>, Integer> itemsets,
                                                           Map<UUID, Integer> itemCounts,
                                                           int totalTransactions,
                                                           double minConfidence) {
        List<MarketBasketDTO> rules = new ArrayList<>();

        for (Map.Entry<Set<UUID>, Integer> entry : itemsets.entrySet()) {
            Set<UUID> itemset = entry.getKey();
            if (itemset.size() != 2) {
                continue;
            }
            List<UUID> items = new ArrayList<>(itemset);
            UUID item1 = items.get(0);
            UUID item2 = items.get(1);

            double confidence1 = calculateConfidence(item1, item2, itemsets, itemCounts, totalTransactions);
            if (confidence1 >= minConfidence) {
                MarketBasketDTO rule = new MarketBasketDTO();
                rule.setAntecedent(List.of(item1));
                rule.setConsequent(List.of(item2));
                rule.setSupport((double) entry.getValue() / totalTransactions);
                rule.setConfidence(confidence1);
                rules.add(rule);
            }

            double confidence2 = calculateConfidence(item2, item1, itemsets, itemCounts, totalTransactions);
            if (confidence2 >= minConfidence) {
                MarketBasketDTO rule = new MarketBasketDTO();
                rule.setAntecedent(List.of(item2));
                rule.setConsequent(List.of(item1));
                rule.setSupport((double) entry.getValue() / totalTransactions);
                rule.setConfidence(confidence2);
                rules.add(rule);
            }
        }

        return rules;
    }

    private double calculateConfidence(UUID itemA, UUID itemB,
                                       Map<Set<UUID>, Integer> itemsets,
                                       Map<UUID, Integer> itemCounts,
                                       int total) {
        int pairCount = itemsets.getOrDefault(Set.of(itemA, itemB), 0);
        int itemCount = itemCounts.getOrDefault(itemA, 0);
        if (itemCount == 0) {
            return 0;
        }
        return (double) pairCount / itemCount;
    }

    private void calculateLift(MarketBasketDTO rule,
                               Map<Set<UUID>, Integer> itemsets,
                               Map<UUID, Integer> itemCounts,
                               int totalTransactions) {
        if (rule.getAntecedent().isEmpty() || rule.getConsequent().isEmpty()) {
            rule.setLift(0);
            return;
        }
        UUID a = rule.getAntecedent().get(0);
        UUID b = rule.getConsequent().get(0);
        int pairCount = itemsets.getOrDefault(Set.of(a, b), 0);
        int countA = itemCounts.getOrDefault(a, 0);
        int countB = itemCounts.getOrDefault(b, 0);
        if (countA == 0 || countB == 0) {
            rule.setLift(0);
            return;
        }
        double supportAB = (double) pairCount / totalTransactions;
        double supportA = (double) countA / totalTransactions;
        double supportB = (double) countB / totalTransactions;
        rule.setLift(supportAB / (supportA * supportB));
    }

    private Map<UUID, Integer> countItems(List<Transaction> transactions) {
        Map<UUID, Integer> counts = new HashMap<>();
        for (Transaction tx : transactions) {
            for (UUID productId : tx.getProductIds()) {
                counts.merge(productId, 1, Integer::sum);
            }
        }
        return counts;
    }

    private void enrichWithNames(List<MarketBasketDTO> rules) {
        Set<UUID> ids = new HashSet<>();
        for (MarketBasketDTO rule : rules) {
            ids.addAll(rule.getAntecedent());
            ids.addAll(rule.getConsequent());
        }
        Map<UUID, String> names = productRepository.findAllById(ids).stream()
            .collect(Collectors.toMap(Product::getId, Product::getName));

        for (MarketBasketDTO rule : rules) {
            rule.setAntecedentNames(rule.getAntecedent().stream().map(names::get).collect(Collectors.toList()));
            rule.setConsequentNames(rule.getConsequent().stream().map(names::get).collect(Collectors.toList()));
        }
    }

    private static class Transaction {
        private final List<UUID> productIds;

        private Transaction(List<UUID> productIds) {
            this.productIds = productIds;
        }

        public List<UUID> getProductIds() {
            return productIds;
        }
    }
}
