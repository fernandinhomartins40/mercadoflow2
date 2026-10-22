package com.pdv2cloud.service.partner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.InvoiceProcessingService;
import com.pdv2cloud.service.localprice.LocalPriceService;
import jakarta.validation.Validator;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** SEG-10: a aprovação do pedido de conexão só vale uma vez, mesmo com duas chamadas simultâneas. */
class ConnectApproveAtomicTest {

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final PartnerWebhookService webhooks = mock(PartnerWebhookService.class);
    private final FirstPartyService service = new FirstPartyService(jdbc, mock(InvoiceProcessingService.class),
        mock(LocalPriceService.class), webhooks, mock(Validator.class), "https://mercadoflow.com");

    private void pendingRequest() throws Exception {
        java.sql.Array scopes = mock(java.sql.Array.class);
        when(scopes.getArray()).thenReturn(new String[] {PartnerScopes.CATALOG_WRITE});
        Map<String, Object> row = new HashMap<>();
        row.put("id", UUID.randomUUID());
        row.put("partner_id", UUID.randomUUID());
        row.put("status", "PENDENTE");
        row.put("expires_at", Timestamp.valueOf(LocalDateTime.now().plusHours(1)));
        row.put("partner_status", "ATIVO");
        row.put("first_party", false);
        row.put("scopes", scopes);
        when(jdbc.queryForList(contains("from partner_connect_requests"), any(SqlParameterSource.class))).thenReturn(List.of(row));
    }

    @Test
    void segundaAprovacaoConcorrenteFalhaSemVincularOutraLoja() throws Exception {
        pendingRequest();
        // A outra aprovação ganhou a corrida: o update condicionado ao status não acha a linha.
        when(jdbc.update(contains("status = 'APROVADO'"), any(SqlParameterSource.class))).thenReturn(0);

        assertThatThrownBy(() -> service.connectApprove(UUID.randomUUID(), CODE, List.of(), "dono@loja.com"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("já foi usado");
        verify(jdbc).update(contains("where id = :id and status = 'PENDENTE'"), any(SqlParameterSource.class));
        verify(jdbc, never()).update(contains("insert into partner_market_links"), any(SqlParameterSource.class));
        verify(webhooks, never()).enqueueTo(any(), any(), anyString(), any());
    }

    static final String CODE = FirstPartyService.CODE_PREFIX + "abc123";
}
