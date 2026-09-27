package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

class ProductEventServiceTest {

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final ProductEventService service = new ProductEventService(jdbc);

    @Test
    void gravaDeFormaIdempotenteComPropsEmJson() {
        UUID market = UUID.randomUUID();
        service.record(market, ProductEventService.ACTIVATION_AGENT_PAIRED, Map.of("via", "pairing"));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbc).update(sql.capture(), params.capture());

        // Sem ON CONFLICT, o segundo marco abortaria a transação da nota fiscal.
        assertTrue(sql.getValue().contains("on conflict do nothing"));
        MapSqlParameterSource p = (MapSqlParameterSource) params.getValue();
        assertEquals(market, p.getValue("marketId"));
        assertEquals("activation.agent_paired", p.getValue("type"));
        assertEquals("{\"via\":\"pairing\"}", p.getValue("props"));
    }

    @Test
    void semPropsGravaObjetoVazio() {
        service.record(UUID.randomUUID(), ProductEventService.ACTIVATION_REGISTERED);

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbc).update(anyString(), params.capture());
        assertEquals("{}", ((MapSqlParameterSource) params.getValue()).getValue("props"));
    }
}
