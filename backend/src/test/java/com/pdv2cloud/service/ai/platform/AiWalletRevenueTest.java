package com.pdv2cloud.service.ai.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.billing.Entitlements;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** D-01 (estorno de pacote de IA) e D-04 (conta cancelada ou suspensa sem créditos do mês). */
class AiWalletRevenueTest {

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final AiWalletService wallets = new AiWalletService(jdbc);
    private final UUID market = UUID.randomUUID();

    // ── D-01 ─────────────────────────────────────────────────────────────

    @Test
    void estornoNuncaTiraMaisQueOPedidoNemDeixaNegativo() {
        assertEquals(30, AiWalletService.reversal(100, 30), "o resto já foi gasto");
        assertEquals(100, AiWalletService.reversal(100, 250), "sobra saldo de outras compras");
        assertEquals(0, AiWalletService.reversal(100, 0));
        assertEquals(0, AiWalletService.reversal(100, -5));
    }

    @Test
    @SuppressWarnings("unchecked")
    void estornoRetiraOsCreditosNaoUsadosEAnota() {
        UUID order = order(100, 30, 0);
        assertEquals(30, wallets.reverseOrder(order, "Pagamento estornado"));

        ArgumentCaptor<Map<String, ?>> p = ArgumentCaptor.forClass(Map.class);
        verify(jdbc).update(contains("balance = balance - :d"), p.capture());
        assertEquals(30, p.getValue().get("d"));
        ArgumentCaptor<SqlParameterSource> l = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbc).update(contains("insert into ai_ledger"), l.capture());
        assertEquals(-30, l.getValue().getValue("d"));
        assertEquals("estorno:" + order, l.getValue().getValue("r"));
        assertEquals("Pagamento estornado: 30 de 100 créditos retirados (70 já usados)", l.getValue().getValue("n"));
    }

    @Test
    void estornoRepetidoOuDePedidoNaoPagoNaoMexe() {
        UUID order = order(100, 100, 1);
        assertEquals(0, wallets.reverseOrder(order, "Pagamento contestado"));
        when(jdbc.queryForList(contains("from ai_orders"), anyMap())).thenReturn(List.of());
        assertEquals(0, wallets.reverseOrder(UUID.randomUUID(), "Pagamento contestado"));
        verify(jdbc, never()).update(contains("balance = balance - :d"), anyMap());
        verify(jdbc, never()).update(contains("insert into ai_ledger"), any(SqlParameterSource.class));
    }

    // ── D-04 ─────────────────────────────────────────────────────────────

    @Test
    void contaCanceladaOuSuspensaNaoRecebeCreditosDoMes() {
        Entitlements entitlements = mock(Entitlements.class);
        wallets.setEntitlements(entitlements);
        for (String status : List.of("CANCELLED", "SUSPENDED")) {
            when(jdbc.queryForList(contains("billing_status"), anyMap(), eq(String.class))).thenReturn(List.of(status));
            wallets.refreshIncluded(market);
        }
        verify(entitlements, never()).amount(any(UUID.class), anyString(), anyInt());
        verify(jdbc, never()).queryForList(contains("update ai_wallets"), anyMap());
    }

    @Test
    void contaEmDiaRecebeCreditosDoMes() {
        Entitlements entitlements = mock(Entitlements.class);
        wallets.setEntitlements(entitlements);
        when(jdbc.queryForList(contains("billing_status"), anyMap(), eq(String.class))).thenReturn(List.of("ACTIVE"));
        when(entitlements.amount(market, "ai_monthly_credits", 0)).thenReturn(500);
        Map<String, Object> before = new HashMap<>();
        before.put("included_granted", 0);
        before.put("new_month", true);
        when(jdbc.queryForMap(contains("included_granted"), anyMap())).thenReturn(before);
        when(jdbc.queryForList(contains("update ai_wallets"), anyMap())).thenReturn(List.of(Map.of("included_granted", 500)));

        wallets.refreshIncluded(market);

        verify(jdbc).update(contains("'PLAN_MONTHLY'"), any(SqlParameterSource.class));
    }

    private UUID order(int credits, int balance, int alreadyReversed) {
        UUID order = UUID.randomUUID();
        when(jdbc.queryForList(contains("from ai_orders"), anyMap())).thenReturn(List.of(Map.of("market_id", market, "credits", credits)));
        when(jdbc.queryForList(contains("for update"), anyMap(), eq(Integer.class))).thenReturn(List.of(balance));
        when(jdbc.queryForObject(contains("from ai_ledger"), anyMap(), eq(Integer.class))).thenReturn(alreadyReversed);
        return order;
    }
}
