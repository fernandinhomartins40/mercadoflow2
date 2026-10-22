package com.pdv2cloud.service.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.service.ai.platform.AiWalletService;
import com.pdv2cloud.service.confere.ConfereService;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** Desistência em 7 dias (CDC art. 49), com o Asaas mockado. */
class WithdrawalServiceTest {

    private final UUID root = UUID.randomUUID();
    private final SubscriptionService subscriptions = mock(SubscriptionService.class);
    private final AsaasService asaas = mock(AsaasService.class);
    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final WithdrawalService service = new WithdrawalService(subscriptions, asaas, jdbc);

    @Test
    void dentroDoPrazoEstornaECancela() {
        active();
        payments(LocalDateTime.now().minusDays(2));

        service.withdraw(root, "PRECO", "caro", "dono@loja.com");

        verify(asaas).refundPayment(eq("pay_1"), anyString());
        verify(asaas).cancelSubscription("sub_1");
        verify(subscriptions).cancel(eq(root), eq(false), contains("Desistência em 7 dias"));
        verify(subscriptions).recordExit(root, "PRECO", "caro", "WITHDRAWN", "dono@loja.com");
        verify(jdbc).update(contains("insert into subscription_withdrawals"), any(SqlParameterSource.class));
        verify(jdbc).update(contains("status = 'DONE'"), any(SqlParameterSource.class));
    }

    @Test
    void foraDoPrazoRecusaSemMexerEmNada() {
        active();
        payments(LocalDateTime.now().minusDays(7).minusHours(1));

        IllegalStateException e = assertThrows(IllegalStateException.class,
            () -> service.withdraw(root, "PRECO", null, "dono@loja.com"));

        assertTrue(e.getMessage().contains("prazo"));
        assertNothingChanged();
    }

    @Test
    void renovacaoNaoVale() {
        active();
        payments(LocalDateTime.now().minusDays(33), LocalDateTime.now().minusDays(2));

        IllegalStateException e = assertThrows(IllegalStateException.class,
            () -> service.withdraw(root, "PRECO", null, "dono@loja.com"));

        assertTrue(e.getMessage().contains("primeira contratação"));
        assertNothingChanged();
    }

    @Test
    void desistenciaJaUsadaNaContaNaoValeDeNovo() {
        active();
        payments(LocalDateTime.now().minusDays(1));
        when(jdbc.queryForObject(contains("status = 'DONE'"), anyMap(), eq(Integer.class))).thenReturn(1);

        assertThrows(IllegalStateException.class, () -> service.withdraw(root, "PRECO", null, "dono@loja.com"));
        assertNothingChanged();
    }

    @Test
    void falhaNoAsaasNaoMudaNada() {
        active();
        payments(LocalDateTime.now().minusDays(1));
        doThrow(new IllegalStateException("O Asaas recusou a operação: saldo insuficiente"))
            .when(asaas).refundPayment(anyString(), anyString());

        IllegalStateException e = assertThrows(IllegalStateException.class,
            () -> service.withdraw(root, "PRECO", null, "dono@loja.com"));

        assertTrue(e.getMessage().contains("Nada foi alterado"));
        assertTrue(e.getMessage().contains("saldo insuficiente"));
        verify(asaas, never()).cancelSubscription(anyString());
        verify(subscriptions, never()).cancel(any(), anyBoolean(), anyString());
        verify(subscriptions, never()).recordExit(any(), any(), any(), any(), any());
        verify(jdbc).update(contains("status = 'FAILED'"), any(SqlParameterSource.class));
        verify(jdbc, never()).update(contains("status = 'DONE'"), any(SqlParameterSource.class));
    }

    @Test
    void estornoFeitoMasAssinaturaNaoApagadaNoAsaasAindaCancelaEAvisa() {
        active();
        payments(LocalDateTime.now().minusDays(1));
        BillingInsightsService insights = mock(BillingInsightsService.class);
        service.setInsights(insights);
        doThrow(new IllegalStateException("fora do ar")).when(asaas).cancelSubscription("sub_1");

        service.withdraw(root, "OUTRO", null, "dono@loja.com");

        verify(subscriptions).cancel(eq(root), eq(false), anyString());
        verify(insights).exception(eq("WITHDRAWAL_CANCEL"), eq(root), eq("sub_1"), anyString());
    }

    @Test
    void regraPura() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 22, 12, 0);
        SubscriptionService.Subscription asaasActive = sub("ASAAS", SubscriptionService.Status.ACTIVE);
        WithdrawalService.Payment paid = new WithdrawalService.Payment("pay_1", 9900, now.minusDays(7));

        // Exatamente 7 dias corridos ainda vale; um minuto depois, não.
        assertTrue(WithdrawalService.evaluate(asaasActive, List.of(paid), false, now).eligible());
        assertFalse(WithdrawalService.evaluate(asaasActive, List.of(paid), false, now.plusMinutes(1)).eligible());
        assertEquals(now, WithdrawalService.evaluate(asaasActive, List.of(paid), false, now).deadline());
        // Assinatura negociada (MANUAL), Grátis ou sem pagamento confirmado: não há o que desistir.
        assertFalse(WithdrawalService.evaluate(sub("MANUAL", SubscriptionService.Status.ACTIVE), List.of(paid), false, now).eligible());
        assertFalse(WithdrawalService.evaluate(sub("NONE", SubscriptionService.Status.FREE), List.of(paid), false, now).eligible());
        assertFalse(WithdrawalService.evaluate(asaasActive, List.of(), false, now).eligible());
    }

    @Test
    void webhookDeEstornoPosteriorNaoPoeEmAtraso() throws Exception {
        SubscriptionService webhookSubs = mock(SubscriptionService.class);
        BillingInsightsService insights = mock(BillingInsightsService.class);
        AsaasService webhookAsaas = mock(AsaasService.class);
        NamedParameterJdbcTemplate webhookJdbc = mock(NamedParameterJdbcTemplate.class);
        when(webhookAsaas.firstDelivery(anyString(), anyString())).thenReturn(true);
        // A assinatura ainda achável pelo id (aviso chegou antes do cancelamento terminar).
        when(webhookJdbc.queryForList(contains("pending_subscription_id = :s"), anyMap(), eq(UUID.class))).thenReturn(List.of(root));
        // O pedido de desistência deste pagamento já está gravado.
        when(webhookJdbc.queryForObject(contains("from subscription_withdrawals where payment_id"), anyMap(), eq(Integer.class)))
            .thenReturn(1);
        AsaasWebhookService webhook = new AsaasWebhookService(webhookAsaas, webhookSubs, mock(AiWalletService.class),
            mock(ConfereService.class), webhookJdbc);
        webhook.setInsights(insights, mock(NotificationService.class));
        webhook.setWithdrawals(new WithdrawalService(webhookSubs, webhookAsaas, webhookJdbc));

        assertEquals(AsaasWebhookService.Outcome.IGNORED, webhook.handle(refund("pay_1", "sub_1", "sub:" + root + ":ESSENCIAL")));

        verify(webhookSubs, never()).paymentFailed(any(), anyString());
        verify(insights, never()).exception(anyString(), any(), any(), anyString());
    }

    @Test
    void estornoQueNaoEDaDesistenciaContinuaNoFluxoD01() throws Exception {
        SubscriptionService webhookSubs = mock(SubscriptionService.class);
        AsaasService webhookAsaas = mock(AsaasService.class);
        NamedParameterJdbcTemplate webhookJdbc = mock(NamedParameterJdbcTemplate.class);
        when(webhookAsaas.firstDelivery(anyString(), anyString())).thenReturn(true);
        when(webhookJdbc.queryForList(contains("pending_subscription_id = :s"), anyMap(), eq(UUID.class))).thenReturn(List.of(root));
        when(webhookJdbc.queryForObject(contains("from subscription_withdrawals where payment_id"), anyMap(), eq(Integer.class)))
            .thenReturn(0);
        AsaasWebhookService webhook = new AsaasWebhookService(webhookAsaas, webhookSubs, mock(AiWalletService.class),
            mock(ConfereService.class), webhookJdbc);
        webhook.setWithdrawals(new WithdrawalService(webhookSubs, webhookAsaas, webhookJdbc));

        assertEquals(AsaasWebhookService.Outcome.EXCEPTION, webhook.handle(refund("pay_9", "sub_1", null)));
        verify(webhookSubs).paymentFailed(eq(root), contains("estornado"));
    }

    // ── Apoio ─────────────────────────────────────────────────────────────

    private void active() {
        when(subscriptions.of(root)).thenReturn(sub("ASAAS", SubscriptionService.Status.ACTIVE));
        when(jdbc.queryForObject(contains("status = 'DONE'"), anyMap(), eq(Integer.class))).thenReturn(0);
    }

    private void payments(LocalDateTime... paidAt) {
        List<Map<String, Object>> rows = new java.util.ArrayList<>();
        for (int i = 0; i < paidAt.length; i++) {
            rows.add(Map.of("payment_id", "pay_" + (i + 1), "value_cents", 9900, "paid_at", Timestamp.valueOf(paidAt[i])));
        }
        when(jdbc.queryForList(contains("from billing_payments"), anyMap())).thenReturn(rows);
    }

    private void assertNothingChanged() {
        verify(asaas, never()).refundPayment(anyString(), anyString());
        verify(asaas, never()).cancelSubscription(anyString());
        verify(subscriptions, never()).cancel(any(), anyBoolean(), anyString());
        verify(jdbc, never()).update(anyString(), any(SqlParameterSource.class));
    }

    private SubscriptionService.Subscription sub(String provider, SubscriptionService.Status status) {
        return new SubscriptionService.Subscription(root, "ESSENCIAL", status, provider, "cus", "ASAAS".equals(provider) ? "sub_1" : null,
            "PIX", LocalDateTime.now().plusDays(25), false, null, null, true, null, null, null, null, null, null);
    }

    private static JsonNode refund(String paymentId, String subId, String ref) {
        Map<String, Object> payment = new java.util.HashMap<>();
        payment.put("id", paymentId);
        payment.put("value", 99.0);
        payment.put("subscription", subId);
        if (ref != null) {
            payment.put("externalReference", ref);
        }
        return new ObjectMapper().valueToTree(Map.of("id", "evt_" + paymentId, "event", "PAYMENT_REFUNDED", "payment", payment));
    }
}
