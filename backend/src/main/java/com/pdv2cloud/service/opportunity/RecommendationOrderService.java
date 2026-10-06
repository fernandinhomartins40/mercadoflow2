package com.pdv2cloud.service.opportunity;

import com.pdv2cloud.model.dto.SupplierOrderDTO;
import com.pdv2cloud.model.dto.SupplierOrderItemDTO;
import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.model.entity.Supplier;
import com.pdv2cloud.model.entity.SupplierOrder;
import com.pdv2cloud.model.entity.SupplierOrderItem;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.repository.RecommendationOutcomeRepository;
import com.pdv2cloud.repository.RecommendationRepository;
import com.pdv2cloud.repository.SupplierOrderItemRepository;
import com.pdv2cloud.repository.SupplierOrderRepository;
import com.pdv2cloud.repository.SupplierRepository;
import com.pdv2cloud.service.SupplierOrderService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Fecha o último metro entre decidir e agir (D-011): aceitar "Comprar N un. de X"
 * coloca X no rascunho de pedido do fornecedor, e "desfazer" volta tudo.
 *
 * O comprador não escolhe o fornecedor nem redigita produto, quantidade e
 * custo — o sistema já sabe: a quantidade é a da recomendação, o fornecedor é
 * de quem a loja comprou o produto da última vez e o custo é o último pago.
 * Sem histórico de compra do produto, a tela pergunta o fornecedor.
 *
 * Nada sai da loja aqui: o item fica em RASCUNHO, que o comprador revisa e
 * envia quando quiser.
 */
@Service
public class RecommendationOrderService {

    /** Resultado do vínculo com o pedido, devolvido para a tela avisar o que aconteceu. */
    public enum LinkStatus {
        /** Produto entrou no rascunho. */
        ADDED,
        /** Produto já estava no rascunho; a quantidade subiu até a sugerida. */
        UPDATED,
        /** Produto já estava no rascunho com quantidade igual ou maior. */
        ALREADY_IN_ORDER,
        /** Sem histórico de compra do produto: a tela precisa perguntar o fornecedor. */
        NEEDS_SUPPLIER
    }

    public record OrderLink(
        LinkStatus status,
        UUID orderId,
        String orderNumber,
        UUID supplierId,
        String supplierName,
        BigDecimal quantity
    ) {
        static OrderLink needsSupplier(BigDecimal quantity) {
            return new OrderLink(LinkStatus.NEEDS_SUPPLIER, null, null, null, null, quantity);
        }
    }

    public record DecisionResult(Recommendation recommendation, OrderLink orderLink) {}

    public record UndoResult(Recommendation recommendation, boolean orderKept) {}

    static final String ITEM_NOTE = "Sugerido pelo MercadoFlow";

    private final RecommendationEngine recommendationEngine;
    private final RecommendationRepository recommendationRepository;
    private final RecommendationOutcomeRepository outcomeRepository;
    private final OpportunityRepository opportunityRepository;
    private final SupplierOrderService supplierOrderService;
    private final SupplierOrderRepository orderRepository;
    private final SupplierOrderItemRepository itemRepository;
    private final SupplierRepository supplierRepository;

    public RecommendationOrderService(
        RecommendationEngine recommendationEngine,
        RecommendationRepository recommendationRepository,
        RecommendationOutcomeRepository outcomeRepository,
        OpportunityRepository opportunityRepository,
        SupplierOrderService supplierOrderService,
        SupplierOrderRepository orderRepository,
        SupplierOrderItemRepository itemRepository,
        SupplierRepository supplierRepository
    ) {
        this.recommendationEngine = recommendationEngine;
        this.recommendationRepository = recommendationRepository;
        this.outcomeRepository = outcomeRepository;
        this.opportunityRepository = opportunityRepository;
        this.supplierOrderService = supplierOrderService;
        this.orderRepository = orderRepository;
        this.itemRepository = itemRepository;
        this.supplierRepository = supplierRepository;
    }

    /**
     * Registra a decisão e, se for uma compra aceita, já a leva ao pedido. Tudo
     * na mesma transação: não existe "aceita" pela metade.
     */
    @Transactional
    public DecisionResult decide(
        UUID marketId, UUID recommendationId, Recommendation.Status decision,
        String actor, String note, UUID supplierId
    ) {
        Recommendation r = recommendationEngine.decide(marketId, recommendationId, decision, actor, note);
        OrderLink link = decision == Recommendation.Status.ACEITA
            ? linkToDraft(marketId, r, supplierId)
            : null;
        return new DecisionResult(r, link);
    }

    /** Segunda chance para a compra aceita sem fornecedor conhecido: a tela informou qual. */
    @Transactional
    public DecisionResult addToOrder(UUID marketId, UUID recommendationId, UUID supplierId) {
        Recommendation r = find(marketId, recommendationId);
        if (r.getStatus() != Recommendation.Status.ACEITA) {
            throw new IllegalStateException("Aceite a recomendação antes de levá-la ao pedido.");
        }
        if (r.getOrderItemId() != null) {
            throw new IllegalStateException("Esta recomendação já está em um pedido.");
        }
        if (supplierId == null) {
            throw new IllegalArgumentException("Informe o fornecedor.");
        }
        OrderLink link = linkToDraft(marketId, r, supplierId);
        if (link == null) {
            throw new IllegalStateException("Esta recomendação não tem quantidade para comprar.");
        }
        return new DecisionResult(r, link);
    }

    /**
     * Volta a recomendação para PROPOSTA e desfaz o que a decisão causou: a
     * medição pendente e, se o pedido ainda for rascunho, o item.
     */
    @Transactional
    public UndoResult undo(UUID marketId, UUID recommendationId, String actor) {
        Recommendation r = find(marketId, recommendationId);
        if (r.getStatus() == Recommendation.Status.PROPOSTA) {
            throw new IllegalStateException("A recomendação ainda não foi decidida.");
        }

        outcomeRepository.findByRecommendationId(r.getId()).ifPresent(outcome -> {
            if (outcome.getMeasuredAt() != null) {
                throw new IllegalStateException("O resultado desta decisão já foi medido; não dá para desfazer.");
            }
            outcomeRepository.delete(outcome);
        });

        boolean orderKept = r.getOrderItemId() != null && !revertOrderItem(marketId, r);

        Opportunity o = r.getOpportunity();
        o.setStatus(Opportunity.Status.VISTA);
        o.setDismissReason(null);
        o.setStatusChangedAt(LocalDateTime.now());
        o.setStatusChangedBy(actor);
        opportunityRepository.save(o);

        r.setStatus(Recommendation.Status.PROPOSTA);
        r.setDecidedBy(null);
        r.setDecidedAt(null);
        r.setDecisionNote(null);
        r.setOrderItemId(null);
        r.setOrderItemPreviousQty(null);
        return new UndoResult(recommendationRepository.save(r), orderKept);
    }

    // ── Regras ──────────────────────────────────────────────────────────────

    /**
     * Quantidade a comprar, ou vazio quando a recomendação não é uma compra com
     * número (ex.: "reduzir próxima compra" também é COMPRAR, mas sem quantidade).
     */
    static Optional<BigDecimal> purchaseQuantity(Recommendation r) {
        if (r.getActionType() != Recommendation.ActionType.COMPRAR) return Optional.empty();
        Map<String, Object> params = r.getParameters();
        if (params == null || "reduzir_proxima_compra".equals(params.get("acao"))) return Optional.empty();
        BigDecimal raw = decimal(params.get("quantidade"));
        if (raw == null || raw.signum() <= 0) return Optional.empty();
        // Mesmo arredondamento do título ("Comprar 24 un."): o número do pedido
        // é o que o comprador leu ao aceitar.
        BigDecimal units = raw.setScale(0, RoundingMode.HALF_UP);
        return Optional.of(units.signum() > 0 ? units : BigDecimal.ONE);
    }

    /**
     * Custo por unidade: o último pago pelo produto; sem histórico, o custo que
     * a própria recomendação usou no valor estimado.
     */
    static BigDecimal unitCost(SupplierOrderItem lastItem, Recommendation r, BigDecimal quantity) {
        // O custo que o lojista informou na decisão vale mais que qualquer estimativa.
        BigDecimal informed = r.getParameters() == null ? null : decimal(r.getParameters().get("custoInformado"));
        if (informed != null && informed.signum() > 0) {
            return informed;
        }
        if (lastItem != null && lastItem.getUnitCost() != null) {
            String unit = lastItem.getUnitType();
            if (unit == null || "UN".equals(unit)) return lastItem.getUnitCost();
            BigDecimal pack = lastItem.getUnitsPerPack();
            if (pack != null && pack.signum() > 0) {
                return lastItem.getUnitCost().divide(pack, 4, RoundingMode.HALF_UP);
            }
        }
        Map<String, Object> params = r.getParameters();
        BigDecimal value = params == null ? null : decimal(params.get("valorEstimado"));
        if (value != null && value.signum() > 0 && quantity.signum() > 0) {
            return value.divide(quantity, 4, RoundingMode.HALF_UP);
        }
        return BigDecimal.ZERO;
    }

    private OrderLink linkToDraft(UUID marketId, Recommendation r, UUID supplierIdOrNull) {
        Optional<BigDecimal> qty = purchaseQuantity(r);
        if (qty.isEmpty() || r.getOpportunity().getProduct() == null) return null;
        // Reaceitar uma recomendação já levada ao pedido não duplica o item.
        if (r.getOrderItemId() != null) return null;
        BigDecimal quantity = qty.get();
        UUID productId = r.getOpportunity().getProduct().getId();

        SupplierOrderItem lastItem = itemRepository
            .findRecentByProduct(marketId, productId, PageRequest.of(0, 1))
            .stream().findFirst().orElse(null);

        Supplier supplier = resolveSupplier(marketId, supplierIdOrNull, lastItem);
        if (supplier == null) return OrderLink.needsSupplier(quantity);

        UUID orderId;
        String orderNumber;
        Optional<SupplierOrder> draft = orderRepository
            .findByMarketIdAndStatus(marketId, SupplierOrder.Status.RASCUNHO).stream()
            .filter(o -> o.getSupplier().getId().equals(supplier.getId()))
            .findFirst();
        if (draft.isPresent()) {
            orderId = draft.get().getId();
            orderNumber = draft.get().getOrderNumber();
        } else {
            SupplierOrderDTO created = supplierOrderService.createOrder(marketId, supplier.getId(), null);
            orderId = created.id();
            orderNumber = created.orderNumber();
        }

        Optional<SupplierOrderItem> existing = itemRepository.findByOrderIdWithProduct(orderId).stream()
            .filter(i -> i.getProduct().getId().equals(productId))
            .findFirst();

        LinkStatus status;
        BigDecimal finalQty;
        if (existing.isPresent()) {
            SupplierOrderItem item = existing.get();
            BigDecimal previous = item.getQuantityRequested();
            r.setOrderItemId(item.getId());
            r.setOrderItemPreviousQty(previous);
            if (previous.compareTo(quantity) < 0) {
                supplierOrderService.updateItem(marketId, orderId, item.getId(),
                    quantity, null, null, null, null, null);
                status = LinkStatus.UPDATED;
                finalQty = quantity;
            } else {
                status = LinkStatus.ALREADY_IN_ORDER;
                finalQty = previous;
            }
        } else {
            BigDecimal salePrice = lastItem != null && (lastItem.getUnitType() == null || "UN".equals(lastItem.getUnitType()))
                ? lastItem.getUnitSalePrice()
                : null;
            SupplierOrderItemDTO added = supplierOrderService.addItem(marketId, orderId, productId,
                quantity, "UN", null, unitCost(lastItem, r, quantity), salePrice, ITEM_NOTE);
            r.setOrderItemId(added.id());
            r.setOrderItemPreviousQty(null);
            status = LinkStatus.ADDED;
            finalQty = quantity;
        }
        recommendationRepository.save(r);

        return new OrderLink(status, orderId, orderNumber, supplier.getId(), displayName(supplier), finalQty);
    }

    private Supplier resolveSupplier(UUID marketId, UUID supplierId, SupplierOrderItem lastItem) {
        if (supplierId != null) {
            Supplier s = supplierRepository.findById(supplierId)
                .orElseThrow(() -> new IllegalArgumentException("Fornecedor não encontrado"));
            if (!s.getMarket().getId().equals(marketId)) {
                throw new IllegalArgumentException("Fornecedor não pertence a este mercado");
            }
            return s;
        }
        if (lastItem == null) return null;
        Supplier last = lastItem.getSupplierOrder().getSupplier();
        return Boolean.FALSE.equals(last.getIsActive()) ? null : last;
    }

    /** @return {@code true} se o pedido foi revertido; {@code false} se ele já saiu do rascunho. */
    private boolean revertOrderItem(UUID marketId, Recommendation r) {
        Optional<SupplierOrderItem> found = itemRepository.findById(r.getOrderItemId());
        if (found.isEmpty()) return true; // apagado à mão: nada a reverter
        SupplierOrderItem item = found.get();
        SupplierOrder order = item.getSupplierOrder();
        if (!order.canEdit()) return false;

        BigDecimal previous = r.getOrderItemPreviousQty();
        if (previous == null) {
            supplierOrderService.removeItem(marketId, order.getId(), item.getId());
            // Rascunho que ficou vazio e sem observação só existia por causa da aceitação.
            List<SupplierOrderItem> remaining = itemRepository.findByOrderIdWithProduct(order.getId());
            if (remaining.isEmpty() && (order.getNotes() == null || order.getNotes().isBlank())) {
                supplierOrderService.deleteOrder(marketId, order.getId());
            }
        } else if (item.getQuantityRequested().compareTo(previous) != 0) {
            supplierOrderService.updateItem(marketId, order.getId(), item.getId(),
                previous, null, null, null, null, null);
        }
        return true;
    }

    private Recommendation find(UUID marketId, UUID recommendationId) {
        return recommendationRepository.findByIdAndMarketId(recommendationId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Recomendacao nao encontrada"));
    }

    private static String displayName(Supplier s) {
        return s.getNomeFantasia() != null && !s.getNomeFantasia().isBlank()
            ? s.getNomeFantasia()
            : s.getRazaoSocial();
    }

    private static BigDecimal decimal(Object value) {
        if (value == null) return null;
        if (value instanceof BigDecimal b) return b;
        try {
            // NaN/Infinity de um Double caem no catch, como texto inválido.
            return new BigDecimal(value.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
