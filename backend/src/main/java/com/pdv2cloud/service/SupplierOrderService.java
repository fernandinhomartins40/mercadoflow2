package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.SupplierOrderDTO;
import com.pdv2cloud.model.dto.SupplierOrderItemDTO;
import com.pdv2cloud.model.entity.*;
import com.pdv2cloud.repository.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SupplierOrderService {

    private final SupplierOrderRepository orderRepo;
    private final SupplierOrderItemRepository itemRepo;
    private final SupplierRepository supplierRepo;
    private final MarketRepository marketRepo;
    private final ProductRepository productRepo;
    private final PurchasePriceHistoryRepository historyRepo;

    public SupplierOrderService(
        SupplierOrderRepository orderRepo,
        SupplierOrderItemRepository itemRepo,
        SupplierRepository supplierRepo,
        MarketRepository marketRepo,
        ProductRepository productRepo,
        PurchasePriceHistoryRepository historyRepo
    ) {
        this.orderRepo   = orderRepo;
        this.itemRepo    = itemRepo;
        this.supplierRepo = supplierRepo;
        this.marketRepo  = marketRepo;
        this.productRepo = productRepo;
        this.historyRepo = historyRepo;
    }

    // ── Listar ───────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<SupplierOrderDTO> listOrders(UUID marketId, String status) {
        List<SupplierOrder> orders = status != null && !status.isBlank()
            ? orderRepo.findByMarketIdAndStatus(marketId, SupplierOrder.Status.valueOf(status.toUpperCase()))
            : orderRepo.findByMarketId(marketId);
        return orders.stream().map(o -> SupplierOrderDTO.from(o, false)).toList();
    }

    @Transactional(readOnly = true)
    public SupplierOrderDTO getOrder(UUID marketId, UUID orderId) {
        SupplierOrder o = orderRepo.findByIdWithItems(orderId, marketId)
            .orElseThrow(() -> new NoSuchElementException("Pedido não encontrado"));
        return SupplierOrderDTO.from(o, true);
    }

    // ── Criar ────────────────────────────────────────────────────────────────

    @Transactional
    public SupplierOrderDTO createOrder(UUID marketId, UUID supplierId, String notes) {
        Market market = marketRepo.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
        Supplier supplier = supplierRepo.findById(supplierId)
            .orElseThrow(() -> new IllegalArgumentException("Fornecedor não encontrado"));
        if (!supplier.getMarket().getId().equals(marketId))
            throw new IllegalArgumentException("Fornecedor não pertence a este mercado");

        int seq = orderRepo.findMaxOrderSequence(marketId) + 1;
        String orderNumber = String.format("PED%05d", seq);

        SupplierOrder order = new SupplierOrder();
        order.setMarket(market);
        order.setSupplier(supplier);
        order.setStatus(SupplierOrder.Status.RASCUNHO);
        order.setOrderNumber(orderNumber);
        order.setOrderDate(LocalDateTime.now());
        order.setNotes(notes);
        order.setTotalValue(BigDecimal.ZERO);

        return SupplierOrderDTO.from(orderRepo.save(order), true);
    }

    // ── Atualizar notas do pedido ─────────────────────────────────────────────

    @Transactional
    public SupplierOrderDTO updateNotes(UUID marketId, UUID orderId, String notes) {
        SupplierOrder o = findEditable(marketId, orderId);
        o.setNotes(notes);
        return SupplierOrderDTO.from(orderRepo.save(o), true);
    }

    // ── Adicionar item ────────────────────────────────────────────────────────

    @Transactional
    public SupplierOrderItemDTO addItem(
            UUID marketId, UUID orderId, UUID productId,
            BigDecimal quantityRequested, String unitType, BigDecimal unitsPerPack,
            BigDecimal unitCost, BigDecimal unitSalePrice, String note) {

        SupplierOrder order = findEditable(marketId, orderId);
        Product product = productRepo.findById(productId)
            .orElseThrow(() -> new IllegalArgumentException("Produto não encontrado"));

        SupplierOrderItem item = new SupplierOrderItem();
        item.setSupplierOrder(order);
        item.setProduct(product);
        item.setQuantityRequested(quantityRequested.setScale(3, RoundingMode.HALF_UP));
        item.setUnitType(unitType != null ? unitType : "UN");
        item.setUnitsPerPack(unitsPerPack);
        item.setUnitCost(unitCost.setScale(4, RoundingMode.HALF_UP));
        item.setUnitSalePrice(unitSalePrice != null ? unitSalePrice.setScale(4, RoundingMode.HALF_UP) : null);
        item.setMarginPercent(calcMargin(unitCost, unitSalePrice));
        item.setSubtotal(quantityRequested.multiply(unitCost).setScale(4, RoundingMode.HALF_UP));
        item.setNote(note);

        SupplierOrderItem saved = itemRepo.save(item);
        recalcTotal(order);
        return SupplierOrderItemDTO.from(saved);
    }

    // ── Editar item ───────────────────────────────────────────────────────────

    @Transactional
    public SupplierOrderItemDTO updateItem(
            UUID marketId, UUID orderId, UUID itemId,
            BigDecimal quantityRequested, String unitType, BigDecimal unitsPerPack,
            BigDecimal unitCost, BigDecimal unitSalePrice, String note) {

        SupplierOrder order = findEditable(marketId, orderId);
        SupplierOrderItem item = itemRepo.findByIdAndSupplierOrderId(itemId, orderId)
            .orElseThrow(() -> new NoSuchElementException("Item não encontrado"));

        if (quantityRequested != null) item.setQuantityRequested(quantityRequested.setScale(3, RoundingMode.HALF_UP));
        if (unitType != null) item.setUnitType(unitType);
        if (unitsPerPack != null) item.setUnitsPerPack(unitsPerPack);
        if (unitCost != null) {
            item.setUnitCost(unitCost.setScale(4, RoundingMode.HALF_UP));
            item.setMarginPercent(calcMargin(unitCost, unitSalePrice != null ? unitSalePrice : item.getUnitSalePrice()));
        }
        if (unitSalePrice != null) {
            item.setUnitSalePrice(unitSalePrice.setScale(4, RoundingMode.HALF_UP));
            item.setMarginPercent(calcMargin(item.getUnitCost(), unitSalePrice));
        }
        if (note != null) item.setNote(note);
        item.setSubtotal(item.getQuantityRequested().multiply(item.getUnitCost()).setScale(4, RoundingMode.HALF_UP));

        SupplierOrderItem saved = itemRepo.save(item);
        recalcTotal(order);
        return SupplierOrderItemDTO.from(saved);
    }

    // ── Remover item ──────────────────────────────────────────────────────────

    @Transactional
    public void removeItem(UUID marketId, UUID orderId, UUID itemId) {
        SupplierOrder order = findEditable(marketId, orderId);
        SupplierOrderItem item = itemRepo.findByIdAndSupplierOrderId(itemId, orderId)
            .orElseThrow(() -> new NoSuchElementException("Item não encontrado"));
        itemRepo.delete(item);
        recalcTotal(order);
    }

    // ── Enviar pedido ─────────────────────────────────────────────────────────

    @Transactional
    public SupplierOrderDTO sendOrder(UUID marketId, UUID orderId) {
        SupplierOrder order = findByMarket(marketId, orderId);
        if (!order.canSend())
            throw new IllegalStateException("Pedido não pode ser enviado no status " + order.getStatus());
        if (order.getItems().isEmpty())
            throw new IllegalStateException("Pedido não tem itens");

        order.setStatus(SupplierOrder.Status.ENVIADO);
        order.setSentAt(LocalDateTime.now());
        return SupplierOrderDTO.from(orderRepo.save(order), true);
    }

    // ── Receber pedido → gera PurchasePriceHistory ────────────────────────────

    @Transactional
    public SupplierOrderDTO receiveOrder(
            UUID marketId, UUID orderId,
            List<Map<String, Object>> itemsReceived,
            LocalDateTime receivedAt) {

        SupplierOrder order = findByIdWithItems(marketId, orderId);
        if (!order.canReceive())
            throw new IllegalStateException("Pedido não pode ser recebido no status " + order.getStatus());

        LocalDateTime deliveredAt = receivedAt != null ? receivedAt : LocalDateTime.now();
        Map<UUID, BigDecimal> receivedQtyMap = new HashMap<>();
        if (itemsReceived != null) {
            for (Map<String, Object> r : itemsReceived) {
                UUID iid = UUID.fromString(r.get("itemId").toString());
                BigDecimal qty = new BigDecimal(r.get("quantityReceived").toString());
                receivedQtyMap.put(iid, qty);
            }
        }

        String supplierName = order.getSupplier().getNomeFantasia() != null
            ? order.getSupplier().getNomeFantasia()
            : order.getSupplier().getRazaoSocial();

        for (SupplierOrderItem item : order.getItems()) {
            BigDecimal qtyReceived = receivedQtyMap.getOrDefault(item.getId(), item.getQuantityRequested());
            item.setQuantityReceived(qtyReceived.setScale(3, RoundingMode.HALF_UP));
            itemRepo.save(item);

            // Registra no histórico de compras apenas ao receber
            PurchasePriceHistory history = new PurchasePriceHistory();
            history.setMarket(order.getMarket());
            history.setProduct(item.getProduct());
            history.setQuantityPurchased(qtyReceived);
            history.setUnitCost(item.getUnitCost());
            history.setUnitSalePrice(item.getUnitSalePrice());
            history.setMarginPercent(item.getMarginPercent());
            history.setSupplierName(supplierName);
            history.setNote("Pedido " + order.getOrderNumber());
            history.setPurchasedAt(deliveredAt);
            history.setCreatedAt(LocalDateTime.now());
            history.setSupplierOrderId(order.getId());
            history.setSupplierOrderItemId(item.getId());
            historyRepo.save(history);
        }

        order.setStatus(SupplierOrder.Status.ENTREGUE);
        order.setDeliveredAt(deliveredAt);
        return SupplierOrderDTO.from(orderRepo.save(order), true);
    }

    // ── Cancelar ──────────────────────────────────────────────────────────────

    @Transactional
    public SupplierOrderDTO cancelOrder(UUID marketId, UUID orderId, String reason) {
        SupplierOrder order = findByMarket(marketId, orderId);
        if (!order.canCancel())
            throw new IllegalStateException("Pedido não pode ser cancelado no status " + order.getStatus());

        order.setStatus(SupplierOrder.Status.CANCELADO);
        order.setCancelledAt(LocalDateTime.now());
        order.setCancelReason(reason);
        return SupplierOrderDTO.from(orderRepo.save(order), true);
    }

    // ── Deletar rascunho ──────────────────────────────────────────────────────

    @Transactional
    public void deleteOrder(UUID marketId, UUID orderId) {
        SupplierOrder order = findEditable(marketId, orderId);
        orderRepo.delete(order);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private SupplierOrder findEditable(UUID marketId, UUID orderId) {
        SupplierOrder o = findByMarket(marketId, orderId);
        if (!o.canEdit())
            throw new IllegalStateException("Pedido não pode ser editado no status " + o.getStatus());
        return o;
    }

    private SupplierOrder findByMarket(UUID marketId, UUID orderId) {
        return orderRepo.findById(orderId)
            .filter(o -> o.getMarket().getId().equals(marketId))
            .orElseThrow(() -> new NoSuchElementException("Pedido não encontrado"));
    }

    private SupplierOrder findByIdWithItems(UUID marketId, UUID orderId) {
        return orderRepo.findByIdWithItems(orderId, marketId)
            .orElseThrow(() -> new NoSuchElementException("Pedido não encontrado"));
    }

    private void recalcTotal(SupplierOrder order) {
        List<SupplierOrderItem> items = itemRepo.findByOrderIdWithProduct(order.getId());
        BigDecimal total = items.stream()
            .map(i -> i.getSubtotal() != null ? i.getSubtotal() : BigDecimal.ZERO)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        order.setTotalValue(total.setScale(4, RoundingMode.HALF_UP));
        orderRepo.save(order);
    }

    private BigDecimal calcMargin(BigDecimal cost, BigDecimal sale) {
        if (cost == null || sale == null || cost.compareTo(BigDecimal.ZERO) == 0) return null;
        if (sale.compareTo(BigDecimal.ZERO) <= 0) return null;
        return sale.subtract(cost)
            .divide(cost, 6, RoundingMode.HALF_UP)
            .multiply(BigDecimal.valueOf(100))
            .setScale(4, RoundingMode.HALF_UP);
    }
}
