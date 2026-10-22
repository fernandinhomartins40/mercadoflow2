package com.pdv2cloud.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.pdv2cloud.security.PartnerPrincipal;
import com.pdv2cloud.service.partner.PartnerAuthService;
import com.pdv2cloud.service.partner.PartnerCallLog;
import com.pdv2cloud.service.partner.PartnerIngestService;
import com.pdv2cloud.service.partner.PartnerOutboundService;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

/** SEG-06: o parceiro não cadastra webhook apontando para a rede interna. */
class PartnerWebhookSsrfTest {

    @Test
    void webhookParaEnderecoInternoERecusado() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        PartnerApiController controller = new PartnerApiController(mock(PartnerAuthService.class), mock(PartnerIngestService.class),
            mock(PartnerOutboundService.class), jdbc, mock(PartnerCallLog.class), "https://mercadoflow.com", "bipae-api");
        PartnerPrincipal partner = new PartnerPrincipal(UUID.randomUUID(), "ERP", "HOMOLOGADO", false);
        var auth = new UsernamePasswordAuthenticationToken(partner, null);

        for (String url : new String[] {"https://127.0.0.1/hook", "https://10.0.0.5:8443/x", "https://169.254.169.254/latest",
                                        "https://[::1]/x"}) {
            ResponseEntity<?> r = controller.webhook(Map.of("url", url), auth);
            assertEquals(400, r.getStatusCode().value(), url);
        }
        verifyNoInteractions(jdbc);
    }
}
