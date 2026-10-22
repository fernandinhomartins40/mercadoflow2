package com.pdv2cloud.service.ai.mcp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.controller.McpController;
import com.pdv2cloud.service.PlanService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** D-06: chave MCP exige o recurso de plano data_export (criar e usar). */
class McpKeyPlanTest {

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final PlanService plans = mock(PlanService.class);
    private final McpKeyService keys = new McpKeyService(jdbc);
    private final UUID market = UUID.randomUUID();

    McpKeyPlanTest() {
        keys.setPlans(plans);
    }

    @Test
    void semDataExportNaoCriaChave() {
        when(plans.canUseDataExport(any())).thenReturn(false);
        when(jdbc.queryForObject(contains("count(*)"), anyMap(), org.mockito.ArgumentMatchers.eq(Integer.class))).thenReturn(0);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> keys.create(market, "Claude", "dono@x"));
        assertEquals(McpKeyService.PLAN_MESSAGE, e.getMessage());
        verify(jdbc, never()).update(contains("insert into ai_mcp_keys"), any(SqlParameterSource.class));
    }

    @Test
    void semDataExportAChaveDevolveErroDePlano() {
        keyOfActiveMarket();
        when(plans.canUseDataExport(any())).thenReturn(false);
        Optional<McpKeyService.Resolved> r = keys.resolve("mfmcp_" + "a".repeat(48));
        assertTrue(r.isPresent());
        assertFalse(r.get().planAllowed());
    }

    @Test
    void comDataExportAChaveVale() {
        keyOfActiveMarket();
        when(plans.canUseDataExport(any())).thenReturn(true);
        assertTrue(keys.resolve("mfmcp_" + "a".repeat(48)).orElseThrow().planAllowed());
    }

    @Test
    void controllerRespondeErroDePlanoSemChamarAsFerramentas() {
        McpKeyService k = mock(McpKeyService.class);
        when(k.resolve("mfmcp_x")).thenReturn(Optional.of(new McpKeyService.Resolved(UUID.randomUUID(), market, false)));
        McpServer server = mock(McpServer.class);
        ResponseEntity<String> r = new McpController(k, server)
            .rpc("Bearer mfmcp_x", "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");
        assertEquals(402, r.getStatusCode().value());
        verify(server).error(null, -32003, McpKeyService.PLAN_MESSAGE);
        verify(server, never()).handle(any(), any());
    }

    @SuppressWarnings("unchecked")
    private void keyOfActiveMarket() {
        when(jdbc.query(contains("update ai_mcp_keys"), anyMap(), any(RowMapper.class)))
            .thenReturn(List.of(new McpKeyService.Resolved(UUID.randomUUID(), market)));
        Map<String, Object> row = new HashMap<>();
        row.put("is_active", true);
        row.put("billing_status", "ACTIVE");
        row.put("access_expires_at", null);
        when(jdbc.queryForList(contains("from markets"), anyMap())).thenReturn(List.of(row));
    }
}
