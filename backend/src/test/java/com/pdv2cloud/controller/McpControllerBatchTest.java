package com.pdv2cloud.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.service.ai.mcp.McpKeyService;
import com.pdv2cloud.service.ai.mcp.McpServer;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

/** SEG-07: lote JSON-RPC no MCP tem teto e cada item conta no limite por minuto. */
class McpControllerBatchTest {

    private static String batch(int n) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < n; i++) {
            sb.append(i == 0 ? "" : ",").append("{\"jsonrpc\":\"2.0\",\"id\":").append(i).append(",\"method\":\"tools/list\"}");
        }
        return sb.append("]").toString();
    }

    private static McpController controller(McpServer server) {
        McpKeyService keys = mock(McpKeyService.class);
        when(keys.resolve("mfmcp_x")).thenReturn(Optional.of(new McpKeyService.Resolved(UUID.randomUUID(), UUID.randomUUID())));
        return new McpController(keys, server);
    }

    @Test
    void loteAcimaDoTetoERecusado() {
        McpServer server = mock(McpServer.class);
        ResponseEntity<String> r = controller(server).rpc("Bearer mfmcp_x", batch(McpController.MAX_BATCH + 1));
        assertEquals(400, r.getStatusCode().value());
        verify(server, never()).handle(any(), any());
    }

    @Test
    void cadaItemDoLoteGastaOLimite() {
        McpServer server = mock(McpServer.class);
        when(server.handle(any(), any())).thenReturn(new ObjectMapper().createObjectNode());
        McpController c = controller(server);
        // 60 por minuto: três lotes de 20 consomem tudo; o quarto não executa nada.
        for (int i = 0; i < 3; i++) {
            c.rpc("Bearer mfmcp_x", batch(20));
        }
        verify(server, times(60)).handle(any(), any());
        c.rpc("Bearer mfmcp_x", batch(20));
        verify(server, times(60)).handle(any(), any());
    }
}
