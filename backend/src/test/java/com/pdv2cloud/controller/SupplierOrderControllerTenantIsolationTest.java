package com.pdv2cloud.controller;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoInteractions;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.SupplierOrderService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.function.Executable;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;

/**
 * Teste de contrato multi-tenant do achado Z-1 da auditoria: TODOS os endpoints
 * de supplier-orders devem validar o acesso ao mercado (assertCanAccessMarket)
 * ANTES de tocar o serviço. Um usuário do mercado A não pode operar sobre o
 * mercado B trocando o {marketId} da URL.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SupplierOrderControllerTenantIsolationTest {

    private static final UUID FOREIGN_MARKET = UUID.randomUUID();
    private static final UUID OWN_MARKET = UUID.randomUUID();
    private static final UUID ORDER_ID = UUID.randomUUID();
    private static final UUID ITEM_ID = UUID.randomUUID();

    @Mock
    private SupplierOrderService service;

    @Mock
    private MarketAccessService marketAccessService;

    @Mock
    private Authentication authentication;

    private SupplierOrderController controller;

    @BeforeEach
    void setUp() {
        controller = new SupplierOrderController(service, marketAccessService);
        doThrow(new AccessDeniedException("Forbidden"))
            .when(marketAccessService).assertCanAccessMarket(FOREIGN_MARKET, authentication);
    }

    @Test
    void todosOsEndpointsRejeitamMercadoAlheioSemTocarOServico() {
        List<Executable> chamadas = List.of(
            () -> controller.list(FOREIGN_MARKET, null, authentication),
            () -> controller.get(FOREIGN_MARKET, ORDER_ID, authentication),
            () -> controller.create(FOREIGN_MARKET, Map.of("supplierId", UUID.randomUUID().toString()), authentication),
            () -> controller.updateNotes(FOREIGN_MARKET, ORDER_ID, Map.of(), authentication),
            () -> controller.addItem(FOREIGN_MARKET, ORDER_ID, Map.of(), authentication),
            () -> controller.updateItem(FOREIGN_MARKET, ORDER_ID, ITEM_ID, Map.of(), authentication),
            () -> controller.removeItem(FOREIGN_MARKET, ORDER_ID, ITEM_ID, authentication),
            () -> controller.send(FOREIGN_MARKET, ORDER_ID, authentication),
            () -> controller.receive(FOREIGN_MARKET, ORDER_ID, null, authentication),
            () -> controller.cancel(FOREIGN_MARKET, ORDER_ID, null, authentication),
            () -> controller.delete(FOREIGN_MARKET, ORDER_ID, authentication)
        );

        for (Executable chamada : chamadas) {
            assertThrows(AccessDeniedException.class, chamada);
        }
        verifyNoInteractions(service);
    }

    @Test
    void mercadoProprioEValidadoAntesDeDelegarAoServico() {
        controller.list(OWN_MARKET, null, authentication);

        InOrder ordem = inOrder(marketAccessService, service);
        ordem.verify(marketAccessService).assertCanAccessMarket(OWN_MARKET, authentication);
        ordem.verify(service).listOrders(OWN_MARKET, null);
    }
}
