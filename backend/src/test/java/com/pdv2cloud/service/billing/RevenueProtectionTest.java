package com.pdv2cloud.service.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.SubscriptionEventService;
import com.pdv2cloud.service.ai.platform.AiWalletService;
import com.pdv2cloud.service.confere.ConfereService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Proteção de receita (lote PIE "receita"): cenários negativos de estado da
 * conta, troca de plano, pausa e aviso fora de ordem do Asaas.
 */
class RevenueProtectionTest {

    // ── Quem pode gastar recurso pago (REC-02/03) ────────────────────────

    @Test
    void contaQueNaoEntraNaoGastaRecursoPago() {
        LocalDateTime future = LocalDateTime.now().plusDays(10);
        assertFalse(AccessPolicy.allowsPaidUse(true, MarketBillingStatus.CANCELLED, null));
        assertFalse(AccessPolicy.allowsPaidUse(true, MarketBillingStatus.SUSPENDED, null));
        assertFalse(AccessPolicy.allowsPaidUse(true, MarketBillingStatus.PENDING, null));
        assertFalse(AccessPolicy.allowsPaidUse(false, MarketBillingStatus.ACTIVE, null), "loja desativada");
        assertFalse(AccessPolicy.allowsPaidUse(true, MarketBillingStatus.ACTIVE, LocalDateTime.now().minusMinutes(1)), "acesso vencido");
        assertFalse(AccessPolicy.allowsPaidUse(true, MarketBillingStatus.RESTRICTED, null), "só consulta");
        assertFalse(AccessPolicy.allowsPaidUse(null), "sem mercado");
    }

    @Test
    void contaEmDiaTesteOuCarenciaGasta() {
        assertTrue(AccessPolicy.allowsPaidUse(true, MarketBillingStatus.ACTIVE, null));
        assertTrue(AccessPolicy.allowsPaidUse(true, MarketBillingStatus.TRIAL, null));
        assertTrue(AccessPolicy.allowsPaidUse(true, MarketBillingStatus.PAST_DUE, null), "carência ainda usa tudo");
        assertTrue(AccessPolicy.allowsPaidUse(true, MarketBillingStatus.ACTIVE, LocalDateTime.now().plusDays(1)));
    }

    @Test
    void ofMarketSegueAMesmaRegra() {
        com.pdv2cloud.model.entity.Market m = new com.pdv2cloud.model.entity.Market();
        m.setIsActive(true);
        m.setBillingStatus(MarketBillingStatus.CANCELLED);
        assertEquals("CANCELLED", new AccessPolicy().of(m).state());
        assertFalse(AccessPolicy.allowsPaidUse(m));
    }

    // ── Troca de plano não zera atraso (REC-01) ──────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void trocaDePlanoNaoTiraContaDaRestricao() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        UUID root = UUID.randomUUID();
        SubscriptionService.Subscription restricted = sub(root, SubscriptionService.Status.RESTRICTED, null, null);
        when(jdbc.queryForList(contains("coalesce(parent_market_id"), anyMap(), eq(UUID.class))).thenReturn(List.of(root));
        when(jdbc.query(anyString(), anyMap(), any(RowMapper.class))).thenReturn(List.of(restricted));
        SubscriptionService service = new SubscriptionService(jdbc, mock(MarketRepository.class), mock(SubscriptionEventService.class),
            mock(NotificationService.class), mock(PlatformTransactionManager.class));

        service.changePlan(root, PlanType.PROFISSIONAL, "teste");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).update(sql.capture(), any(SqlParameterSource.class));
        assertTrue(sql.getValue().contains("plan_code = :p"));
        assertFalse(sql.getValue().contains("status"), "a troca não mexe no estado");
        assertFalse(sql.getValue().contains("restricted_since"), "a troca não zera a restrição");
    }

    // ── Pausa retomada antes do fim (REC-06) ─────────────────────────────

    @Test
    void retomadaAntesDoFimRecuaOPeriodoPago() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 1, 12, 0);
        // Pausou 2 meses: período foi de 01/11 para 01/01; retoma em 01/10 (60 dias de pausa sobrando).
        SubscriptionService.Subscription s = sub(UUID.randomUUID(), SubscriptionService.Status.PAUSED,
            LocalDateTime.of(2027, 1, 1, 12, 0), now.plusDays(60));
        assertEquals(LocalDateTime.of(2027, 1, 1, 12, 0).minusDays(60), SubscriptionService.earlyResumePeriodEnd(s, now));
    }

    @Test
    void pausaQueTerminouNoDiaNaoMexeNoPeriodo() {
        LocalDateTime now = LocalDateTime.of(2026, 12, 1, 12, 0);
        SubscriptionService.Subscription s = sub(UUID.randomUUID(), SubscriptionService.Status.PAUSED,
            LocalDateTime.of(2027, 1, 1, 12, 0), now.minusMinutes(1));
        assertNull(SubscriptionService.earlyResumePeriodEnd(s, now));
        assertNull(SubscriptionService.earlyResumePeriodEnd(sub(UUID.randomUUID(), SubscriptionService.Status.ACTIVE,
            now.plusDays(30), now.plusDays(10)), now), "só conta pausada");
    }

    @Test
    void retomadaNuncaRecuaParaAntesDeAgora() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 1, 12, 0);
        SubscriptionService.Subscription s = sub(UUID.randomUUID(), SubscriptionService.Status.PAUSED, now.plusDays(5), now.plusDays(60));
        assertEquals(now, SubscriptionService.earlyResumePeriodEnd(s, now));
    }

    // ── Aviso do Asaas fora de ordem (REC-05) ────────────────────────────

    @Test
    void vencimentoDeFaturaJaPagaNaoPoeEmAtraso() throws Exception {
        Webhook w = new Webhook();
        when(w.jdbc.queryForObject(contains("billing_payments"), anyMap(), eq(Integer.class))).thenReturn(1);
        assertEquals(AsaasWebhookService.Outcome.IGNORED, w.service.handle(overdue()));
        verify(w.subscriptions, never()).paymentFailed(any(), anyString());
    }

    @Test
    void vencimentoDeFaturaNaoPagaPoeEmAtraso() throws Exception {
        Webhook w = new Webhook();
        UUID root = UUID.randomUUID();
        when(w.jdbc.queryForObject(contains("billing_payments"), anyMap(), eq(Integer.class))).thenReturn(0);
        when(w.jdbc.queryForList(contains("provider = 'ASAAS'"), anyMap(), eq(UUID.class))).thenReturn(List.of(root));
        assertEquals(AsaasWebhookService.Outcome.SUBSCRIPTION_LATE, w.service.handle(overdue()));
        verify(w.subscriptions).paymentFailed(eq(root), anyString());
    }

    // ── Apoio ────────────────────────────────────────────────────────────

    private static final class Webhook {
        final AsaasService asaas = mock(AsaasService.class);
        final SubscriptionService subscriptions = mock(SubscriptionService.class);
        final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        final AsaasWebhookService service = new AsaasWebhookService(asaas, subscriptions, mock(AiWalletService.class),
            mock(ConfereService.class), jdbc);

        Webhook() {
            when(asaas.firstDelivery(anyString(), anyString())).thenReturn(true);
        }
    }

    private static JsonNode overdue() throws Exception {
        return new ObjectMapper().readTree("{\"id\":\"evt_1\",\"event\":\"PAYMENT_OVERDUE\",\"payment\":{\"id\":\"pay_1\","
            + "\"subscription\":\"sub_1\",\"externalReference\":\"sub:x:ESSENCIAL\",\"value\":99.0}}");
    }

    private static SubscriptionService.Subscription sub(UUID id, SubscriptionService.Status status, LocalDateTime periodEnd,
                                                        LocalDateTime pausedUntil) {
        return new SubscriptionService.Subscription(id, "ESSENCIAL", status, "ASAAS", "cus", "sub_1", "PIX", periodEnd, false,
            null, null, true, null, null, pausedUntil, null, null, null);
    }
}
