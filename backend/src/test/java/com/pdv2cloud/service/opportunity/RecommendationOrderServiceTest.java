package com.pdv2cloud.service.opportunity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.dto.SupplierOrderDTO;
import com.pdv2cloud.model.dto.SupplierOrderItemDTO;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.model.entity.RecommendationOutcome;
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
import com.pdv2cloud.service.opportunity.RecommendationOrderService.LinkStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Aceitar uma compra vira item de pedido sem redigitação (D-011), e desfazer
 * devolve tudo ao que era.
 */
class RecommendationOrderServiceTest {

    private RecommendationEngine engine;
    private RecommendationRepository recommendationRepository;
    private RecommendationOutcomeRepository outcomeRepository;
    private OpportunityRepository opportunityRepository;
    private SupplierOrderService supplierOrderService;
    private SupplierOrderRepository orderRepository;
    private SupplierOrderItemRepository itemRepository;
    private SupplierRepository supplierRepository;
    private RecommendationOrderService service;

    private final UUID marketId = UUID.randomUUID();
    private Market market;
    private Product product;
    private Supplier supplier;

    @BeforeEach
    void setUp() {
        engine = mock(RecommendationEngine.class);
        recommendationRepository = mock(RecommendationRepository.class);
        outcomeRepository = mock(RecommendationOutcomeRepository.class);
        opportunityRepository = mock(OpportunityRepository.class);
        supplierOrderService = mock(SupplierOrderService.class);
        orderRepository = mock(SupplierOrderRepository.class);
        itemRepository = mock(SupplierOrderItemRepository.class);
        supplierRepository = mock(SupplierRepository.class);
        service = new RecommendationOrderService(engine, recommendationRepository, outcomeRepository,
            opportunityRepository, supplierOrderService, orderRepository, itemRepository, supplierRepository);

        market = new Market();
        market.setId(marketId);
        product = new Product();
        product.setId(UUID.randomUUID());
        product.setName("Arroz 5kg");
        supplier = new Supplier();
        supplier.setId(UUID.randomUUID());
        supplier.setMarket(market);
        supplier.setRazaoSocial("Distribuidora Ltda");
        supplier.setNomeFantasia("Dist Boa");

        when(recommendationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(orderRepository.findByMarketIdAndStatus(marketId, SupplierOrder.Status.RASCUNHO)).thenReturn(List.of());
        when(itemRepository.findRecentByProduct(eq(marketId), eq(product.getId()), any())).thenReturn(List.of());
        when(itemRepository.findByOrderIdWithProduct(any())).thenReturn(List.of());
    }

    private Recommendation buy(Object quantity, Object value) {
        Opportunity o = new Opportunity();
        o.setId(UUID.randomUUID());
        o.setProduct(product);
        o.setStatus(Opportunity.Status.EM_ACAO);

        Map<String, Object> params = new HashMap<>();
        params.put("quantidade", quantity);
        params.put("valorEstimado", value);
        params.put("produtoId", product.getId().toString());

        Recommendation r = new Recommendation();
        r.setId(UUID.randomUUID());
        r.setMarket(market);
        r.setOpportunity(o);
        r.setActionType(Recommendation.ActionType.COMPRAR);
        r.setParameters(params);
        r.setStatus(Recommendation.Status.ACEITA);
        return r;
    }

    private SupplierOrder order(SupplierOrder.Status status) {
        SupplierOrder o = new SupplierOrder();
        o.setId(UUID.randomUUID());
        o.setMarket(market);
        o.setSupplier(supplier);
        o.setStatus(status);
        o.setOrderNumber("PED00007");
        return o;
    }

    private SupplierOrderItem item(SupplierOrder order, String qty, String cost, String unit, String pack) {
        SupplierOrderItem i = new SupplierOrderItem();
        i.setId(UUID.randomUUID());
        i.setSupplierOrder(order);
        i.setProduct(product);
        i.setQuantityRequested(new BigDecimal(qty));
        i.setUnitCost(new BigDecimal(cost));
        i.setUnitType(unit);
        i.setUnitsPerPack(pack == null ? null : new BigDecimal(pack));
        return i;
    }

    private void accept(Recommendation r) {
        when(engine.decide(eq(marketId), eq(r.getId()), eq(Recommendation.Status.ACEITA), any(), any())).thenReturn(r);
    }

    private SupplierOrderItemDTO itemDto(UUID id) {
        SupplierOrderItemDTO dto = mock(SupplierOrderItemDTO.class);
        when(dto.id()).thenReturn(id);
        return dto;
    }

    @Test
    @DisplayName("fornecedor e custo vêm da última compra do produto; entra no rascunho aberto dele")
    void addsToExistingDraftOfLastSupplier() {
        Recommendation r = buy(23.6, 500);
        accept(r);
        SupplierOrder past = order(SupplierOrder.Status.ENTREGUE);
        when(itemRepository.findRecentByProduct(eq(marketId), eq(product.getId()), any()))
            .thenReturn(List.of(item(past, "12", "60.00", "CX", "12")));
        SupplierOrder draft = order(SupplierOrder.Status.RASCUNHO);
        when(orderRepository.findByMarketIdAndStatus(marketId, SupplierOrder.Status.RASCUNHO)).thenReturn(List.of(draft));
        UUID newItem = UUID.randomUUID();
        SupplierOrderItemDTO added = itemDto(newItem);
        when(supplierOrderService.addItem(any(), any(), any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(added);

        var result = service.decide(marketId, r.getId(), Recommendation.Status.ACEITA, "ana", null, null);

        assertEquals(LinkStatus.ADDED, result.orderLink().status());
        assertEquals(draft.getId(), result.orderLink().orderId());
        assertEquals("Dist Boa", result.orderLink().supplierName());
        // 23,6 un. arredonda como o título; caixa de 12 a R$ 60 = R$ 5 por unidade
        verify(supplierOrderService).addItem(eq(marketId), eq(draft.getId()), eq(product.getId()),
            eq(new BigDecimal("24")), eq("UN"), isNull(), eq(new BigDecimal("5.0000")), any(),
            eq(RecommendationOrderService.ITEM_NOTE));
        verify(supplierOrderService, never()).createOrder(any(), any(), any());
        assertEquals(newItem, r.getOrderItemId());
        assertNull(r.getOrderItemPreviousQty());
    }

    @Test
    @DisplayName("sem rascunho do fornecedor, cria um; sem histórico de custo, usa o da recomendação")
    void createsDraftWhenSupplierGiven() {
        Recommendation r = buy("10", "45");
        accept(r);
        when(supplierRepository.findById(supplier.getId())).thenReturn(Optional.of(supplier));
        SupplierOrderDTO created = mock(SupplierOrderDTO.class);
        UUID orderId = UUID.randomUUID();
        when(created.id()).thenReturn(orderId);
        when(created.orderNumber()).thenReturn("PED00008");
        when(supplierOrderService.createOrder(marketId, supplier.getId(), null)).thenReturn(created);
        SupplierOrderItemDTO added = itemDto(UUID.randomUUID());
        when(supplierOrderService.addItem(any(), any(), any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(added);

        var result = service.decide(marketId, r.getId(), Recommendation.Status.ACEITA, "ana", null, supplier.getId());

        assertEquals("PED00008", result.orderLink().orderNumber());
        verify(supplierOrderService).addItem(eq(marketId), eq(orderId), eq(product.getId()),
            eq(new BigDecimal("10")), eq("UN"), isNull(), eq(new BigDecimal("4.5000")), isNull(), any());
    }

    @Test
    @DisplayName("produto nunca comprado e sem fornecedor informado: pede o fornecedor, não inventa")
    void needsSupplierWithoutHistory() {
        Recommendation r = buy(5, 50);
        accept(r);

        var result = service.decide(marketId, r.getId(), Recommendation.Status.ACEITA, "ana", null, null);

        assertEquals(LinkStatus.NEEDS_SUPPLIER, result.orderLink().status());
        assertEquals(new BigDecimal("5"), result.orderLink().quantity());
        verify(supplierOrderService, never()).addItem(any(), any(), any(), any(), any(), any(), any(), any(), any());
        assertNull(r.getOrderItemId());
    }

    @Test
    @DisplayName("produto já no rascunho com menos: sobe até a sugerida e guarda a anterior para desfazer")
    void raisesExistingItem() {
        Recommendation r = buy(20, 100);
        accept(r);
        SupplierOrder draft = order(SupplierOrder.Status.RASCUNHO);
        SupplierOrderItem existing = item(draft, "8", "5", "UN", null);
        when(itemRepository.findRecentByProduct(eq(marketId), eq(product.getId()), any())).thenReturn(List.of(existing));
        when(orderRepository.findByMarketIdAndStatus(marketId, SupplierOrder.Status.RASCUNHO)).thenReturn(List.of(draft));
        when(itemRepository.findByOrderIdWithProduct(draft.getId())).thenReturn(List.of(existing));

        var result = service.decide(marketId, r.getId(), Recommendation.Status.ACEITA, "ana", null, null);

        assertEquals(LinkStatus.UPDATED, result.orderLink().status());
        verify(supplierOrderService).updateItem(marketId, draft.getId(), existing.getId(),
            new BigDecimal("20"), null, null, null, null, null);
        assertEquals(new BigDecimal("8"), r.getOrderItemPreviousQty());
    }

    @Test
    @DisplayName("produto já no rascunho com mais do que o sugerido: não mexe")
    void keepsLargerExistingItem() {
        Recommendation r = buy(5, 25);
        accept(r);
        SupplierOrder draft = order(SupplierOrder.Status.RASCUNHO);
        SupplierOrderItem existing = item(draft, "30", "5", "UN", null);
        when(itemRepository.findRecentByProduct(eq(marketId), eq(product.getId()), any())).thenReturn(List.of(existing));
        when(orderRepository.findByMarketIdAndStatus(marketId, SupplierOrder.Status.RASCUNHO)).thenReturn(List.of(draft));
        when(itemRepository.findByOrderIdWithProduct(draft.getId())).thenReturn(List.of(existing));

        var result = service.decide(marketId, r.getId(), Recommendation.Status.ACEITA, "ana", null, null);

        assertEquals(LinkStatus.ALREADY_IN_ORDER, result.orderLink().status());
        assertEquals(new BigDecimal("30"), result.orderLink().quantity());
        verify(supplierOrderService, never()).updateItem(any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("'reduzir próxima compra', rejeição e promoção não geram item")
    void onlyPurchasesWithQuantityGoToOrder() {
        Recommendation reduce = buy(null, null);
        reduce.getParameters().put("acao", "reduzir_proxima_compra");
        assertTrue(RecommendationOrderService.purchaseQuantity(reduce).isEmpty());

        Recommendation promo = buy(10, 10);
        promo.setActionType(Recommendation.ActionType.PROMOVER);
        assertTrue(RecommendationOrderService.purchaseQuantity(promo).isEmpty());

        assertTrue(RecommendationOrderService.purchaseQuantity(buy("NaN", null)).isEmpty());
        assertEquals(new BigDecimal("1"), RecommendationOrderService.purchaseQuantity(buy(0.3, null)).get());

        Recommendation rejected = buy(10, 10);
        when(engine.decide(eq(marketId), eq(rejected.getId()), eq(Recommendation.Status.REJEITADA), any(), any()))
            .thenReturn(rejected);
        assertNull(service.decide(marketId, rejected.getId(), Recommendation.Status.REJEITADA, "ana", "não", null).orderLink());
    }

    @Test
    @DisplayName("desfazer: remove o item criado, apaga o rascunho vazio, volta a PROPOSTA e cancela a medição")
    void undoRemovesCreatedItem() {
        Recommendation r = buy(10, 10);
        r.setDecidedBy("ana");
        r.setDecidedAt(LocalDateTime.now());
        SupplierOrder draft = order(SupplierOrder.Status.RASCUNHO);
        SupplierOrderItem created = item(draft, "10", "1", "UN", null);
        r.setOrderItemId(created.getId());
        when(recommendationRepository.findByIdAndMarketId(r.getId(), marketId)).thenReturn(Optional.of(r));
        when(itemRepository.findById(created.getId())).thenReturn(Optional.of(created));
        RecommendationOutcome pending = new RecommendationOutcome();
        when(outcomeRepository.findByRecommendationId(r.getId())).thenReturn(Optional.of(pending));

        var result = service.undo(marketId, r.getId(), "ana");

        assertFalse(result.orderKept());
        verify(supplierOrderService).removeItem(marketId, draft.getId(), created.getId());
        verify(supplierOrderService).deleteOrder(marketId, draft.getId());
        verify(outcomeRepository).delete(pending);
        assertEquals(Recommendation.Status.PROPOSTA, r.getStatus());
        assertNull(r.getDecidedBy());
        assertNull(r.getOrderItemId());
        assertEquals(Opportunity.Status.VISTA, r.getOpportunity().getStatus());
    }

    @Test
    @DisplayName("desfazer: item que já existia volta à quantidade anterior")
    void undoRestoresPreviousQuantity() {
        Recommendation r = buy(20, 10);
        SupplierOrder draft = order(SupplierOrder.Status.RASCUNHO);
        SupplierOrderItem raised = item(draft, "20", "1", "UN", null);
        r.setOrderItemId(raised.getId());
        r.setOrderItemPreviousQty(new BigDecimal("8"));
        when(recommendationRepository.findByIdAndMarketId(r.getId(), marketId)).thenReturn(Optional.of(r));
        when(itemRepository.findById(raised.getId())).thenReturn(Optional.of(raised));
        when(outcomeRepository.findByRecommendationId(r.getId())).thenReturn(Optional.empty());

        service.undo(marketId, r.getId(), "ana");

        verify(supplierOrderService).updateItem(marketId, draft.getId(), raised.getId(),
            new BigDecimal("8"), null, null, null, null, null);
        verify(supplierOrderService, never()).removeItem(any(), any(), any());
    }

    @Test
    @DisplayName("desfazer com pedido já enviado: decisão volta, pedido fica como está e a tela é avisada")
    void undoKeepsSentOrder() {
        Recommendation r = buy(10, 10);
        SupplierOrderItem sentItem = item(order(SupplierOrder.Status.ENVIADO), "10", "1", "UN", null);
        r.setOrderItemId(sentItem.getId());
        when(recommendationRepository.findByIdAndMarketId(r.getId(), marketId)).thenReturn(Optional.of(r));
        when(itemRepository.findById(sentItem.getId())).thenReturn(Optional.of(sentItem));
        when(outcomeRepository.findByRecommendationId(r.getId())).thenReturn(Optional.empty());

        var result = service.undo(marketId, r.getId(), "ana");

        assertTrue(result.orderKept());
        verify(supplierOrderService, never()).removeItem(any(), any(), any());
        assertEquals(Recommendation.Status.PROPOSTA, r.getStatus());
    }

    @Test
    @DisplayName("desfazer é recusado quando o resultado já foi medido ou nada foi decidido")
    void undoRefusedWhenMeasured() {
        Recommendation r = buy(10, 10);
        when(recommendationRepository.findByIdAndMarketId(r.getId(), marketId)).thenReturn(Optional.of(r));
        RecommendationOutcome measured = new RecommendationOutcome();
        measured.setMeasuredAt(LocalDateTime.now());
        when(outcomeRepository.findByRecommendationId(r.getId())).thenReturn(Optional.of(measured));
        assertThrows(IllegalStateException.class, () -> service.undo(marketId, r.getId(), "ana"));

        Recommendation proposed = buy(10, 10);
        proposed.setStatus(Recommendation.Status.PROPOSTA);
        when(recommendationRepository.findByIdAndMarketId(proposed.getId(), marketId)).thenReturn(Optional.of(proposed));
        assertThrows(IllegalStateException.class, () -> service.undo(marketId, proposed.getId(), "ana"));
    }

    @Test
    @DisplayName("fornecedor de outra loja é recusado")
    void rejectsForeignSupplier() {
        Recommendation r = buy(10, 10);
        accept(r);
        Market other = new Market();
        other.setId(UUID.randomUUID());
        supplier.setMarket(other);
        when(supplierRepository.findById(supplier.getId())).thenReturn(Optional.of(supplier));

        assertThrows(IllegalArgumentException.class,
            () -> service.decide(marketId, r.getId(), Recommendation.Status.ACEITA, "ana", null, supplier.getId()));
    }
}
