package com.pdv2cloud.service.ai.mcp;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** REC-03: chave MCP de loja cancelada, suspensa ou vencida para de abrir dados. */
class McpKeyAccountStateTest {

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final McpKeyService keys = new McpKeyService(jdbc);
    private final UUID market = UUID.randomUUID();

    @SuppressWarnings("unchecked")
    private void keyOf(String status, boolean active) {
        when(jdbc.query(contains("update ai_mcp_keys"), anyMap(), any(RowMapper.class)))
            .thenReturn(List.of(new McpKeyService.Resolved(UUID.randomUUID(), market)));
        Map<String, Object> row = new HashMap<>();
        row.put("is_active", active);
        row.put("billing_status", status);
        row.put("access_expires_at", null);
        when(jdbc.queryForList(contains("from markets"), anyMap())).thenReturn(List.of(row));
    }

    @Test
    void lojaCanceladaSuspensaOuDesativadaNaoUsaChave() {
        for (String s : List.of("CANCELLED", "SUSPENDED", "PENDING")) {
            keyOf(s, true);
            assertTrue(keys.resolve("mfmcp_" + "a".repeat(48)).isEmpty(), s);
        }
        keyOf("ACTIVE", false);
        assertTrue(keys.resolve("mfmcp_" + "a".repeat(48)).isEmpty(), "desativada");
    }

    @Test
    void lojaQueEntraUsaChave() {
        for (String s : List.of("ACTIVE", "TRIAL", "PAST_DUE", "RESTRICTED")) {
            keyOf(s, true);
            assertFalse(keys.resolve("mfmcp_" + "a".repeat(48)).isEmpty(), s);
        }
    }
}
