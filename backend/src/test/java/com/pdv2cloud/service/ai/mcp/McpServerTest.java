package com.pdv2cloud.service.ai.mcp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.service.ai.AiUsageRecorder;
import com.pdv2cloud.service.ai.chat.CapitalTools;
import com.pdv2cloud.service.ai.chat.DataTool;
import com.pdv2cloud.service.ai.chat.OpportunityTools;
import com.pdv2cloud.service.ai.chat.SalesTools;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Servidor MCP: só leitura, e o mercado vem da chave, nunca dos argumentos de quem chama. */
class McpServerTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final UUID market = UUID.randomUUID();
    private McpServer server;
    private UUID seenMarket;
    private TenantContext.TenantInfo seenTenant;

    @BeforeEach
    void setUp() {
        DataTool tool = new DataTool() {
            @Override public String name() { return "resumo_de_vendas"; }
            @Override public String description() { return "Faturamento e cupons."; }
            @Override public Map<String, Object> parametersSchema() {
                return DataTool.schema(Map.of("dias", Map.of("type", "integer")), List.of());
            }
            @Override public Map<String, Object> execute(UUID m, Map<String, Object> args) {
                seenMarket = m;
                seenTenant = TenantContext.get();
                return Map.of("faturamento", 1234.5, "periodoDias", args.getOrDefault("dias", 30));
            }
        };
        SalesTools sales = mock(SalesTools.class);
        when(sales.tools()).thenReturn(List.of(tool));
        CapitalTools capital = mock(CapitalTools.class);
        when(capital.tools()).thenReturn(List.of());
        OpportunityTools opps = mock(OpportunityTools.class);
        when(opps.tools()).thenReturn(List.of());
        server = new McpServer(capital, sales, opps, mock(AiUsageRecorder.class));
    }

    private JsonNode call(String json) throws Exception {
        return server.handle(mapper.readTree(json), market);
    }

    @Test
    void inicializaNegociandoAVersao() throws Exception {
        JsonNode r = call("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-03-26\"}}");
        assertEquals("2025-03-26", r.path("result").path("protocolVersion").asText());
        assertEquals("mercadoflow", r.path("result").path("serverInfo").path("name").asText());
        JsonNode other = call("{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"1999-01-01\"}}");
        assertEquals(McpServer.PROTOCOL_VERSIONS.get(0), other.path("result").path("protocolVersion").asText());
    }

    @Test
    void notificacaoNaoTemResposta() throws Exception {
        assertNull(call("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}"));
    }

    @Test
    void ferramentasSaoSoLeitura() throws Exception {
        JsonNode tools = call("{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/list\"}").path("result").path("tools");
        assertEquals(1, tools.size());
        assertEquals("resumo_de_vendas", tools.get(0).path("name").asText());
        assertTrue(tools.get(0).path("annotations").path("readOnlyHint").asBoolean());
        assertEquals("object", tools.get(0).path("inputSchema").path("type").asText());
    }

    @Test
    void mercadoVemDaChaveENaoDosArgumentos() throws Exception {
        UUID other = UUID.randomUUID();
        JsonNode r = call("{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"resumo_de_vendas\","
            + "\"arguments\":{\"dias\":7,\"marketId\":\"" + other + "\"}}}");
        assertEquals(market, seenMarket);
        assertEquals(market, seenTenant.marketId(), "a consulta roda com o mercado da chave no contexto (RLS)");
        assertFalse(seenTenant.bypassTenantIsolation());
        assertNull(TenantContext.get(), "o contexto é limpo depois da chamada");
        assertFalse(r.path("result").path("isError").asBoolean());
        assertEquals(7, r.path("result").path("structuredContent").path("periodoDias").asInt());
        assertTrue(r.path("result").path("content").get(0).path("text").asText().contains("1234.5"));
    }

    @Test
    void ferramentaOuMetodoDesconhecido() throws Exception {
        assertEquals(-32602, call("{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"apagar_tudo\"}}")
            .path("error").path("code").asInt());
        assertEquals(-32601, call("{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"resources/list\"}").path("error").path("code").asInt());
    }

    @Test
    void hashDaChaveEDeterministico() {
        assertEquals(McpKeyService.hash("mfmcp_abc"), McpKeyService.hash("mfmcp_abc"));
        assertEquals(64, McpKeyService.hash("mfmcp_abc").length());
    }
}
