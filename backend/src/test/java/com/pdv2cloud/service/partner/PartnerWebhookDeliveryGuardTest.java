package com.pdv2cloud.service.partner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

/** SEG-06 (residual): URL interna já gravada é recusada na hora do envio, com o erro registrado. */
class PartnerWebhookDeliveryGuardTest {

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final PartnerWebhookService service = new PartnerWebhookService(jdbc);

    private void due(String url, boolean firstParty) {
        Map<String, Object> row = new HashMap<>();
        row.put("id", UUID.randomUUID());
        row.put("event", "order.sent");
        row.put("body", "{}");
        row.put("attempts", 0);
        row.put("webhook_url", url);
        row.put("webhook_secret", "whsec_x");
        row.put("first_party", firstParty);
        when(jdbc.queryForList(contains("from partner_webhook_events"), anyMap())).thenReturn(List.of(row));
    }

    @Test
    void urlInternaGravadaNaoRecebeOAviso() {
        due("https://127.0.0.1/hook", false);

        assertThat(service.deliverDue()).isZero();

        verify(jdbc).update(contains("last_error = :err"), argThat((MapSqlParameterSource p) ->
            String.valueOf(p.getValue("err")).contains("endereço interno")));
        verify(jdbc, never()).update(contains("status = 'ENTREGUE'"), argThat((MapSqlParameterSource p) -> true));
    }

    @Test
    void httpSoParaHostInternoDoParceiroDaCasa() {
        ReflectionTestUtils.setField(service, "internalHosts", "erp-casa");

        assertThat(service.blockedUrl("http://erp-casa:8080/hook", true)).isNull();
        assertThat(service.blockedUrl("http://erp-casa:8080/hook", false)).contains("https");
        assertThat(service.blockedUrl("https://169.254.169.254/latest", true)).contains("endereço interno");
    }
}
