package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.PurchasePriceHistoryDTO;
import com.pdv2cloud.model.dto.RecordPurchaseRequest;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.model.entity.PurchasePriceHistory;
import com.pdv2cloud.model.entity.ShoppingListItem;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.PurchasePriceHistoryRepository;
import com.pdv2cloud.repository.ShoppingListItemRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PurchasePriceService {

    private final PurchasePriceHistoryRepository historyRepository;
    private final MarketRepository marketRepository;
    private final ProductRepository productRepository;
    private final ShoppingListItemRepository shoppingListItemRepository;

    public PurchasePriceService(
        PurchasePriceHistoryRepository historyRepository,
        MarketRepository marketRepository,
        ProductRepository productRepository,
        ShoppingListItemRepository shoppingListItemRepository
    ) {
        this.historyRepository = historyRepository;
        this.marketRepository = marketRepository;
        this.productRepository = productRepository;
        this.shoppingListItemRepository = shoppingListItemRepository;
    }

    @Transactional
    public PurchasePriceHistoryDTO recordPurchase(UUID marketId, RecordPurchaseRequest request) {
        if (request.getProductId() == null) {
            throw new IllegalArgumentException("Produto é obrigatório");
        }
        if (request.getUnitCost() == null || request.getUnitCost().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Custo unitário é obrigatório e deve ser positivo");
        }

        Market market = marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
        Product product = productRepository.findById(request.getProductId())
            .orElseThrow(() -> new IllegalArgumentException("Produto não encontrado"));

        ShoppingListItem listItem = null;
        if (request.getShoppingListItemId() != null) {
            listItem = shoppingListItemRepository.findByIdAndMarketId(request.getShoppingListItemId(), marketId)
                .orElse(null);
        }

        // Calcular margem se preço de venda informado
        BigDecimal margin = null;
        if (request.getUnitSalePrice() != null && request.getUnitSalePrice().compareTo(BigDecimal.ZERO) > 0) {
            margin = request.getUnitSalePrice()
                .subtract(request.getUnitCost())
                .divide(request.getUnitCost(), 6, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(4, RoundingMode.HALF_UP);
        }

        BigDecimal qty = request.getQuantityPurchased() != null && request.getQuantityPurchased().compareTo(BigDecimal.ZERO) > 0
            ? request.getQuantityPurchased().setScale(3, RoundingMode.HALF_UP)
            : BigDecimal.ONE;

        PurchasePriceHistory entry = new PurchasePriceHistory();
        entry.setMarket(market);
        entry.setProduct(product);
        entry.setShoppingListItem(listItem);
        entry.setQuantityPurchased(qty);
        entry.setUnitCost(request.getUnitCost().setScale(4, RoundingMode.HALF_UP));
        entry.setUnitSalePrice(request.getUnitSalePrice() != null ? request.getUnitSalePrice().setScale(4, RoundingMode.HALF_UP) : null);
        entry.setMarginPercent(margin);
        entry.setSupplierName(request.getSupplierName() != null ? request.getSupplierName().trim() : null);
        entry.setNote(request.getNote() != null ? request.getNote().trim() : null);
        entry.setPurchasedAt(LocalDateTime.now());
        entry.setCreatedAt(LocalDateTime.now());

        PurchasePriceHistory saved = historyRepository.save(entry);
        List<PurchasePriceHistory> history = historyRepository.findByMarketIdAndProductId(marketId, request.getProductId());
        return toDto(saved, history);
    }

    @Transactional(readOnly = true)
    public List<PurchasePriceHistoryDTO> getHistory(UUID marketId, UUID productId) {
        List<PurchasePriceHistory> history = historyRepository.findByMarketIdAndProductId(marketId, productId);
        return enrichWithDeltas(history);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private List<PurchasePriceHistoryDTO> enrichWithDeltas(List<PurchasePriceHistory> history) {
        // history is already sorted desc by purchasedAt
        return java.util.stream.IntStream.range(0, history.size())
            .mapToObj(i -> toDto(history.get(i), history))
            .toList();
    }

    private PurchasePriceHistoryDTO toDto(PurchasePriceHistory entry, List<PurchasePriceHistory> allForProduct) {
        // Find the previous entry (next in list since sorted desc)
        PurchasePriceHistory prev = allForProduct.stream()
            .filter(h -> !h.getId().equals(entry.getId())
                      && h.getPurchasedAt().isBefore(entry.getPurchasedAt()))
            .findFirst()
            .orElse(null);

        BigDecimal prevCost = null;
        BigDecimal deltaPercent = null;
        String trend = "FIRST";

        if (prev != null) {
            prevCost = prev.getUnitCost();
            if (prevCost != null && prevCost.compareTo(BigDecimal.ZERO) > 0) {
                deltaPercent = entry.getUnitCost()
                    .subtract(prevCost)
                    .divide(prevCost, 6, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100))
                    .setScale(2, RoundingMode.HALF_UP);
                if (deltaPercent.abs().compareTo(BigDecimal.valueOf(0.5)) <= 0) {
                    trend = "STABLE";
                } else {
                    trend = deltaPercent.compareTo(BigDecimal.ZERO) > 0 ? "UP" : "DOWN";
                }
            }
        }

        return new PurchasePriceHistoryDTO(
            entry.getId(),
            entry.getProduct().getId(),
            entry.getProduct().getName(),
            entry.getShoppingListItem() != null ? entry.getShoppingListItem().getId() : null,
            entry.getQuantityPurchased(),
            entry.getUnitCost(),
            entry.getUnitSalePrice(),
            entry.getMarginPercent(),
            entry.getSupplierName(),
            entry.getNote(),
            entry.getPurchasedAt(),
            prevCost,
            deltaPercent,
            trend
        );
    }
}
