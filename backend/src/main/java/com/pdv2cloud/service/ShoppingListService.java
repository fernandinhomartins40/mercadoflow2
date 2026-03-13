package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.ShoppingListItemDTO;
import com.pdv2cloud.model.dto.ShoppingListItemUpsertRequest;
import com.pdv2cloud.model.dto.ShoppingListOverviewDTO;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.model.entity.ShoppingListItem;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.ShoppingListItemRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShoppingListService {

    private final ShoppingListItemRepository shoppingListItemRepository;
    private final MarketRepository marketRepository;
    private final ProductRepository productRepository;

    public ShoppingListService(
        ShoppingListItemRepository shoppingListItemRepository,
        MarketRepository marketRepository,
        ProductRepository productRepository
    ) {
        this.shoppingListItemRepository = shoppingListItemRepository;
        this.marketRepository = marketRepository;
        this.productRepository = productRepository;
    }

    @Transactional(readOnly = true)
    public ShoppingListOverviewDTO getOverview(UUID marketId) {
        List<ShoppingListItemDTO> items = shoppingListItemRepository.findDetailedByMarketId(marketId).stream()
            .map(this::toDto)
            .toList();
        long checked = items.stream().filter(item -> Boolean.TRUE.equals(item.getChecked())).count();
        return new ShoppingListOverviewDTO(
            items.size(),
            checked,
            items.size() - checked,
            items
        );
    }

    @Transactional
    public ShoppingListItemDTO addOrUpdate(UUID marketId, ShoppingListItemUpsertRequest request) {
        if (request.getProductId() == null) {
            throw new IllegalArgumentException("Produto é obrigatório");
        }

        Market market = marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
        Product product = productRepository.findById(request.getProductId())
            .orElseThrow(() -> new IllegalArgumentException("Produto não encontrado"));

        ShoppingListItem item = shoppingListItemRepository.findByMarketIdAndProductId(marketId, request.getProductId())
            .orElseGet(() -> {
                ShoppingListItem created = new ShoppingListItem();
                created.setMarket(market);
                created.setProduct(product);
                created.setQuantityTarget(BigDecimal.ONE);
                created.setSourceTag("MANUAL");
                created.setIsChecked(false);
                return created;
            });

        item.setProduct(product);
        item.setQuantityTarget(normalizeQuantity(request.getQuantityTarget(), item.getQuantityTarget()));
        item.setNote(normalizeText(request.getNote()));
        item.setSourceTag(normalizeTag(request.getSourceTag(), item.getSourceTag()));
        item.setReasonSummary(normalizeText(request.getReasonSummary()));
        if (request.getChecked() != null) {
            item.setIsChecked(request.getChecked());
        }

        return toDto(shoppingListItemRepository.save(item));
    }

    @Transactional
    public ShoppingListItemDTO updateItem(UUID marketId, UUID itemId, ShoppingListItemUpsertRequest request) {
        ShoppingListItem item = shoppingListItemRepository.findByIdAndMarketId(itemId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Item da lista não encontrado"));

        if (request.getQuantityTarget() != null) {
            item.setQuantityTarget(normalizeQuantity(request.getQuantityTarget(), item.getQuantityTarget()));
        }
        if (request.getNote() != null) {
            item.setNote(normalizeText(request.getNote()));
        }
        if (request.getSourceTag() != null) {
            item.setSourceTag(normalizeTag(request.getSourceTag(), item.getSourceTag()));
        }
        if (request.getReasonSummary() != null) {
            item.setReasonSummary(normalizeText(request.getReasonSummary()));
        }
        if (request.getChecked() != null) {
            item.setIsChecked(request.getChecked());
        }

        return toDto(shoppingListItemRepository.save(item));
    }

    @Transactional
    public void deleteItem(UUID marketId, UUID itemId) {
        ShoppingListItem item = shoppingListItemRepository.findByIdAndMarketId(itemId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Item da lista não encontrado"));
        shoppingListItemRepository.delete(item);
    }

    private ShoppingListItemDTO toDto(ShoppingListItem item) {
        Product product = item.getProduct();
        return new ShoppingListItemDTO(
            item.getId(),
            product.getId(),
            product.getEan(),
            product.getName(),
            product.getCategory(),
            product.getBrand(),
            product.getImageUrl(),
            item.getQuantityTarget(),
            item.getNote(),
            item.getSourceTag(),
            item.getReasonSummary(),
            item.getIsChecked(),
            item.getCreatedAt(),
            item.getUpdatedAt()
        );
    }

    private BigDecimal normalizeQuantity(BigDecimal requested, BigDecimal fallback) {
        BigDecimal candidate = requested == null ? fallback : requested;
        if (candidate == null || candidate.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ONE;
        }
        return candidate.setScale(3, java.math.RoundingMode.HALF_UP).stripTrailingZeros();
    }

    private String normalizeTag(String sourceTag, String fallback) {
        String value = sourceTag == null || sourceTag.isBlank() ? fallback : sourceTag.trim();
        return value == null || value.isBlank() ? "MANUAL" : value.toUpperCase();
    }

    private String normalizeText(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }
}
