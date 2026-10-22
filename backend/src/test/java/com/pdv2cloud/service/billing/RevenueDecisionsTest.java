package com.pdv2cloud.service.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.SubscriptionEventService;
import com.pdv2cloud.service.ai.platform.AiWalletService;
import com.pdv2cloud.service.confere.ConfereService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Decisões de receita aprovadas em 22/10/2026 (lote 3, docs/pie/lotes/receita.md):
 * D-01 estorno e contestação, D-02 downgrade em atraso, D-04 loja desligada
 * pelo superadmin não volta com pagamento.
 */
class RevenueDecisionsTest {

    // ── D-01: estorno e contestação no Asaas ─────────────────────────────

    @Test
    void estornoDePacoteDeIaRetiraCreditosEAlerta() throws Exception {
        Webhook w = new Webhook();
        UUID order = UUID.randomUUID();
        when(w.wallets.reverseOrder(order, "Pagamento estornado")).thenReturn(40);
        assertEquals(AsaasWebhookService.Outcome.EXCEPTION, w.service.handle(refund("PAYMENT_REFUNDED", null, "ai:" + order)));
        verify(w.wallets).reverseOrder(order, "Pagamento estornado");
        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(w.insights).exception(eq("PAYMENT_REFUNDED"), isNull(), eq("pay_1"), detail.capture());
        assertTrue(detail.getValue().contains("Créditos de IA retirados: 40"), detail.getValue());
        verify(w.subscriptions, never()).paymentFailed(any(), anyString());
    }

    @Test
    void contestacaoDePacoteDoConfereRetiraLeituras() throws Exception {
        Webhook w = new Webhook();
        UUID order = UUID.randomUUID();
        assertEquals(AsaasWebhookService.Outcome.EXCEPTION,
            w.service.handle(refund("PAYMENT_CHARGEBACK_REQUESTED", null, "confere:" + order)));
        verify(w.confere).reverseOrder(order, "Pagamento contestado");
        verify(w.insights).exception(eq("PAYMENT_CHARGEBACK_REQUESTED"), isNull(), eq("pay_1"), anyString());
    }

    @Test
    void estornoDaAssinaturaPoeEmAtraso() throws Exception {
        Webhook w = new Webhook();
        UUID root = UUID.randomUUID();
        when(w.jdbc.queryForList(contains("pending_subscription_id = :s"), anyMap(), eq(UUID.class))).thenReturn(List.of(root));
        assertEquals(AsaasWebhookService.Outcome.EXCEPTION,
            w.service.handle(refund("PAYMENT_CHARGEBACK_DISPUTE", "sub_1", "sub:" + root + ":ESSENCIAL")));
        verify(w.subscriptions).paymentFailed(eq(root), contains("contestado"));
        verify(w.insights).exception(eq("PAYMENT_CHARGEBACK_DISPUTE"), eq(root), eq("pay_1"), anyString());
        verify(w.wallets, never()).reverseOrder(any(), anyString());
    }

    @Test
    void estornoDeAssinaturaDeOutroSistemaContinuaIgnorado() throws Exception {
        Webhook w = new Webhook();
        assertEquals(AsaasWebhookService.Outcome.IGNORED, w.service.handle(refund("PAYMENT_REFUNDED", "sub_alheia", null)));
        verify(w.subscriptions, never()).paymentFailed(any(), anyString());
        verifyNoInteractions(w.insights, w.wallets, w.confere);
    }

    @Test
    void avisoRepetidoNaoRetiraDeNovo() throws Exception {
        Webhook w = new Webhook();
        when(w.asaas.firstDelivery(anyString(), anyString())).thenReturn(false);
        assertEquals(AsaasWebhookService.Outcome.DUPLICATE,
            w.service.handle(refund("PAYMENT_REFUNDED", null, "ai:" + UUID.randomUUID())));
        verifyNoInteractions(w.insights, w.wallets, w.confere);
    }

    @Test
    @SuppressWarnings("unchecked")
    void confereRetiraSoOQueSobrouNuncaNegativo() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        UUID market = UUID.randomUUID();
        UUID order = UUID.randomUUID();
        when(jdbc.queryForList(contains("from confere_orders"), anyMap())).thenReturn(List.of(Map.of("market_id", market, "reads", 100)));
        when(jdbc.queryForList(contains("for update"), anyMap(), eq(Integer.class))).thenReturn(List.of(25));
        when(jdbc.queryForObject(contains("from confere_ledger"), anyMap(), eq(Integer.class))).thenReturn(0);
        ConfereService confere = new ConfereService(jdbc, null, null, null, null, null, null);

        assertEquals(25, confere.reverseOrder(order, "Pagamento estornado"));

        ArgumentCaptor<Map<String, ?>> p = ArgumentCaptor.forClass(Map.class);
        verify(jdbc).update(contains("balance = balance - :d"), p.capture());
        assertEquals(25, p.getValue().get("d"));
        ArgumentCaptor<SqlParameterSource> l = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbc).update(contains("insert into confere_ledger"), l.capture());
        assertEquals(-25, l.getValue().getValue("d"));
        assertEquals("estorno:" + order, l.getValue().getValue("r"));
    }

    @Test
    void confereEstornoJaFeitoNaoTiraDeNovo() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        when(jdbc.queryForList(contains("from confere_orders"), anyMap()))
            .thenReturn(List.of(Map.of("market_id", UUID.randomUUID(), "reads", 100)));
        when(jdbc.queryForList(contains("for update"), anyMap(), eq(Integer.class))).thenReturn(List.of(100));
        when(jdbc.queryForObject(contains("from confere_ledger"), anyMap(), eq(Integer.class))).thenReturn(1);
        ConfereService confere = new ConfereService(jdbc, null, null, null, null, null, null);

        assertEquals(0, confere.reverseOrder(UUID.randomUUID(), "Pagamento contestado"));
        verify(jdbc, never()).update(contains("balance = balance - :d"), anyMap());
        verify(jdbc, never()).update(contains("insert into confere_ledger"), any(SqlParameterSource.class));
    }

    // ── D-02: em atraso não desce de plano ───────────────────────────────

    @Test
    void contaEmAtrasoNaoDesceDePlano() {
        for (SubscriptionService.Status st : List.of(SubscriptionService.Status.PAST_DUE, SubscriptionService.Status.RESTRICTED)) {
            SubscriptionService.Subscription s = sub(UUID.randomUUID(), st, "PROFISSIONAL");
            IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> SubscriptionService.assertCanChangePlan(s, PlanType.ESSENCIAL), st.name());
            assertEquals("Regularize o pagamento para trocar para um plano menor.", e.getMessage());
            assertThrows(IllegalStateException.class, () -> SubscriptionService.assertCanChangePlan(s, PlanType.FREE), st.name());
        }
    }

    @Test
    void upgradeEContaEmDiaContinuamLiberados() {
        SubscriptionService.assertCanChangePlan(sub(UUID.randomUUID(), SubscriptionService.Status.PAST_DUE, "ESSENCIAL"), PlanType.PROFISSIONAL);
        SubscriptionService.assertCanChangePlan(sub(UUID.randomUUID(), SubscriptionService.Status.RESTRICTED, "ESSENCIAL"), PlanType.PROFISSIONAL);
        SubscriptionService.assertCanChangePlan(sub(UUID.randomUUID(), SubscriptionService.Status.ACTIVE, "PROFISSIONAL"), PlanType.ESSENCIAL);
    }

    @Test
    @SuppressWarnings("unchecked")
    void changePlanRecusaDowngradeSemGravar() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        UUID root = UUID.randomUUID();
        when(jdbc.queryForList(contains("coalesce(parent_market_id"), anyMap(), eq(UUID.class))).thenReturn(List.of(root));
        when(jdbc.query(anyString(), anyMap(), any(RowMapper.class)))
            .thenReturn(List.of(sub(root, SubscriptionService.Status.RESTRICTED, "PROFISSIONAL")));
        SubscriptionService service = new SubscriptionService(jdbc, mock(MarketRepository.class), mock(SubscriptionEventService.class),
            mock(NotificationService.class), mock(PlatformTransactionManager.class));

        assertThrows(IllegalStateException.class, () -> service.changePlan(root, PlanType.ESSENCIAL, "teste"));
        verify(jdbc, never()).update(anyString(), any(SqlParameterSource.class));
    }

    // ── D-04: pagamento não religa loja desligada pelo superadmin ────────

    @Test
    void pagamentoNaoReligaLojaDesligadaPeloSuperadmin() {
        Market m = market(false, LocalDateTime.now().minusDays(3));
        changePlanOn(m);
        assertFalse(m.getIsActive(), "a marca do superadmin vale mais que o pagamento");
    }

    @Test
    void lojaSemMarcaVoltaAoPagar() {
        Market m = market(false, null);
        changePlanOn(m);
        assertTrue(m.getIsActive());
    }

    // ── Apoio ────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private static void changePlanOn(Market m) {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        MarketRepository markets = mock(MarketRepository.class);
        when(jdbc.queryForList(contains("coalesce(parent_market_id"), anyMap(), eq(UUID.class))).thenReturn(List.of(m.getId()));
        when(jdbc.query(anyString(), anyMap(), any(RowMapper.class)))
            .thenReturn(List.of(sub(m.getId(), SubscriptionService.Status.ACTIVE, "ESSENCIAL")));
        when(markets.findById(m.getId())).thenReturn(Optional.of(m));
        new SubscriptionService(jdbc, markets, mock(SubscriptionEventService.class), mock(NotificationService.class),
            mock(PlatformTransactionManager.class)).changePlan(m.getId(), PlanType.PROFISSIONAL, "teste");
        verify(markets).save(m);
    }

    private static Market market(boolean active, LocalDateTime disabledByAdmin) {
        Market m = new Market();
        m.setId(UUID.randomUUID());
        m.setIsActive(active);
        m.setDisabledByAdminAt(disabledByAdmin);
        m.setPlanType(PlanType.ESSENCIAL);
        return m;
    }

    private static final class Webhook {
        final AsaasService asaas = mock(AsaasService.class);
        final SubscriptionService subscriptions = mock(SubscriptionService.class);
        final AiWalletService wallets = mock(AiWalletService.class);
        final ConfereService confere = mock(ConfereService.class);
        final BillingInsightsService insights = mock(BillingInsightsService.class);
        final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        final AsaasWebhookService service = new AsaasWebhookService(asaas, subscriptions, wallets, confere, jdbc);

        Webhook() {
            when(asaas.firstDelivery(anyString(), anyString())).thenReturn(true);
            service.setInsights(insights, mock(NotificationService.class));
        }
    }

    private static JsonNode refund(String event, String subId, String ref) throws Exception {
        Map<String, Object> payment = new java.util.HashMap<>();
        payment.put("id", "pay_1");
        payment.put("value", 49.9);
        if (subId != null) {
            payment.put("subscription", subId);
        }
        if (ref != null) {
            payment.put("externalReference", ref);
        }
        ObjectMapper om = new ObjectMapper();
        return om.valueToTree(Map.of("id", "evt_" + event, "event", event, "payment", payment));
    }

    private static SubscriptionService.Subscription sub(UUID id, SubscriptionService.Status status, String plan) {
        return new SubscriptionService.Subscription(id, plan, status, "ASAAS", "cus", "sub_1", "PIX", null, false,
            null, null, true, null, null, null, null, null, null);
    }
}
