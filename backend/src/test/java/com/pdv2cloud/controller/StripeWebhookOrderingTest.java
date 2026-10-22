package com.pdv2cloud.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.repository.StripeProcessedEventRepository;
import com.pdv2cloud.service.InvoiceReconciliationService;
import com.pdv2cloud.service.StripeService;
import com.pdv2cloud.service.confere.ConfereService;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

/** REC-09: registro atômico do evento e descarte de evento de assinatura fora de ordem. */
class StripeWebhookOrderingTest {

    private static final String SECRET = "whsec_teste";

    private final StripeService stripe = mock(StripeService.class);
    private final StripeProcessedEventRepository repo = mock(StripeProcessedEventRepository.class);
    private final StripeWebhookController controller = new StripeWebhookController(
        stripe, repo, mock(InvoiceReconciliationService.class), mock(ConfereService.class));
    private final UUID marketId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(controller, "webhookSecret", SECRET);
        when(stripe.marketIdFor(any())).thenReturn(Optional.of(marketId));
    }

    private static String payload(String eventId, String type, long created, String status) {
        return "{\"id\":\"" + eventId + "\",\"object\":\"event\",\"api_version\":\"" + com.stripe.Stripe.API_VERSION + "\",\"type\":\"" + type + "\",\"created\":" + created
            + ",\"data\":{\"object\":{\"id\":\"sub_1\",\"object\":\"subscription\",\"status\":\"" + status
            + "\",\"customer\":\"cus_1\",\"metadata\":{}}}}";
    }

    private ResponseEntity<String> post(String payload) throws Exception {
        long ts = System.currentTimeMillis() / 1000;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String sig = HexFormat.of().formatHex(mac.doFinal((ts + "." + payload).getBytes(StandardCharsets.UTF_8)));
        return controller.handle(payload, "t=" + ts + ",v1=" + sig);
    }

    @Test
    void eventoJaRegistradoNaoEProcessado() throws Exception {
        when(repo.claim(eq("evt_dup"), anyString(), any())).thenReturn(0);

        ResponseEntity<String> r = post(payload("evt_dup", "customer.subscription.updated", 1_700_000_000L, "active"));

        assertThat(r.getBody()).isEqualTo("duplicate");
        verify(stripe, never()).syncSubscription(any());
        verify(repo, never()).attachMarket(anyString(), any());
    }

    @Test
    void updatedAntigoDepoisDoDeletedEIgnorado() throws Exception {
        // O "deleted" (created = 1_700_000_100) já foi aplicado; chega um "updated" active anterior.
        when(repo.claim(eq("evt_old"), eq("customer.subscription.updated"), eq(1_700_000_000L))).thenReturn(1);
        when(repo.lastSubscriptionEventEpoch(marketId, "evt_old")).thenReturn(1_700_000_100L);

        ResponseEntity<String> r = post(payload("evt_old", "customer.subscription.updated", 1_700_000_000L, "active"));

        assertThat(r.getBody()).isEqualTo("ok");
        verify(stripe, never()).syncSubscription(any());
        verify(repo, never()).attachMarket(anyString(), any());
    }

    @Test
    void eventoMaisNovoEAplicadoEMarcadoNoMercado() throws Exception {
        when(repo.claim(eq("evt_new"), eq("customer.subscription.deleted"), eq(1_700_000_200L))).thenReturn(1);
        when(repo.lastSubscriptionEventEpoch(marketId, "evt_new")).thenReturn(1_700_000_100L);

        ResponseEntity<String> r = post(payload("evt_new", "customer.subscription.deleted", 1_700_000_200L, "canceled"));

        assertThat(r.getBody()).isEqualTo("ok");
        verify(repo).attachMarket("evt_new", marketId);
        verify(stripe).syncSubscription(any());
    }

    @Test
    void eventoQueNaoEDeAssinaturaRegistraSemDataDoStripe() throws Exception {
        when(repo.claim(eq("evt_inv"), eq("invoice.created"), isNull())).thenReturn(1);
        String payload = "{\"id\":\"evt_inv\",\"object\":\"event\",\"api_version\":\"" + com.stripe.Stripe.API_VERSION + "\",\"type\":\"invoice.created\",\"created\":1700000000,"
            + "\"data\":{\"object\":{\"id\":\"in_1\",\"object\":\"invoice\"}}}";

        assertThat(post(payload).getBody()).isEqualTo("ok");
        verify(repo).claim("evt_inv", "invoice.created", null);
    }
}
