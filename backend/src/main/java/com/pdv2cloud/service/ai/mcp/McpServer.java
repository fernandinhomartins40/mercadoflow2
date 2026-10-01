package com.pdv2cloud.service.ai.mcp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.service.ai.AiUsageRecorder;
import com.pdv2cloud.service.ai.chat.CapitalTools;
import com.pdv2cloud.service.ai.chat.DataTool;
import com.pdv2cloud.service.ai.chat.OpportunityTools;
import com.pdv2cloud.service.ai.chat.SalesTools;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Servidor MCP do MercadoFlow (proposta, seção 8.7): as mesmas consultas do
 * "Pergunte aos dados", só leitura, para qualquer agente externo que fale MCP
 * (Claude, ChatGPT, dsh). Transporte HTTP com JSON-RPC 2.0, sem sessão.
 *
 * O mercado vem sempre da chave, nunca dos argumentos: a consulta roda com o
 * mercado da chave no contexto, e a RLS do banco garante o resto.
 */
@Service
public class McpServer {

    private static final Logger log = LoggerFactory.getLogger(McpServer.class);
    public static final List<String> PROTOCOL_VERSIONS = List.of("2025-06-18", "2025-03-26", "2024-11-05");
    static final String INSTRUCTIONS = "Dados da loja no MercadoFlow (supermercado brasileiro): vendas, estoque estimado, "
        + "o que comprar, capital parado, oportunidades e recomendações. Todas as ferramentas são só leitura e já "
        + "respondem com os números calculados pelo sistema; não invente valores fora delas. Valores em reais.";

    private final Map<String, DataTool> tools = new LinkedHashMap<>();
    private final AiUsageRecorder usage;
    private final ObjectMapper mapper = new ObjectMapper();

    public McpServer(CapitalTools capital, SalesTools sales, OpportunityTools opportunities, AiUsageRecorder usage) {
        List<DataTool> all = new ArrayList<>();
        all.addAll(sales.tools());
        all.addAll(capital.tools());
        all.addAll(opportunities.tools());
        all.forEach(t -> tools.put(t.name(), t));
        this.usage = usage;
    }

    /** Uma mensagem JSON-RPC; null para notificação (sem resposta). */
    public ObjectNode handle(JsonNode msg, UUID marketId) {
        JsonNode id = msg.get("id");
        String method = msg.path("method").asText("");
        if (id == null || id.isNull()) {
            return null;
        }
        try {
            return switch (method) {
                case "initialize" -> result(id, initialize(msg.path("params")));
                case "ping" -> result(id, mapper.createObjectNode());
                case "tools/list" -> result(id, listTools());
                case "tools/call" -> callTool(id, msg.path("params"), marketId);
                default -> error(id, -32601, "Método não suportado: " + method);
            };
        } catch (RuntimeException e) {
            log.warn("MCP {} falhou: {}", method, e.getMessage());
            return error(id, -32603, "Erro interno");
        }
    }

    public ObjectNode error(JsonNode id, int code, String message) {
        ObjectNode out = mapper.createObjectNode();
        out.put("jsonrpc", "2.0");
        out.set("id", id == null ? mapper.nullNode() : id);
        ObjectNode err = out.putObject("error");
        err.put("code", code);
        err.put("message", message);
        return out;
    }

    private ObjectNode initialize(JsonNode params) {
        String asked = params.path("protocolVersion").asText("");
        ObjectNode r = mapper.createObjectNode();
        r.put("protocolVersion", PROTOCOL_VERSIONS.contains(asked) ? asked : PROTOCOL_VERSIONS.get(0));
        r.putObject("capabilities").putObject("tools").put("listChanged", false);
        ObjectNode info = r.putObject("serverInfo");
        info.put("name", "mercadoflow");
        info.put("title", "MercadoFlow");
        info.put("version", "1.0.0");
        r.put("instructions", INSTRUCTIONS);
        return r;
    }

    private ObjectNode listTools() {
        ObjectNode r = mapper.createObjectNode();
        ArrayNode list = r.putArray("tools");
        for (DataTool t : tools.values()) {
            ObjectNode n = list.addObject();
            n.put("name", t.name());
            n.put("description", t.description());
            n.set("inputSchema", mapper.valueToTree(t.parametersSchema()));
            n.putObject("annotations").put("readOnlyHint", true).put("openWorldHint", false);
        }
        return r;
    }

    private ObjectNode callTool(JsonNode id, JsonNode params, UUID marketId) {
        String name = params.path("name").asText("");
        DataTool tool = tools.get(name);
        if (tool == null) {
            return error(id, -32602, "Ferramenta desconhecida: " + name);
        }
        Map<String, Object> args = params.path("arguments").isObject()
            ? mapper.convertValue(params.path("arguments"), new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {})
            : Map.of();
        long started = System.currentTimeMillis();
        TenantContext.TenantInfo previous = TenantContext.get();
        TenantContext.set(new TenantContext.TenantInfo(marketId, false));
        ObjectNode r = mapper.createObjectNode();
        try {
            Map<String, Object> data = tool.execute(marketId, args);
            String text = mapper.writeValueAsString(data);
            r.putArray("content").addObject().put("type", "text").put("text", text);
            r.set("structuredContent", mapper.valueToTree(data));
            r.put("isError", data != null && data.containsKey("erro"));
            usage.recordFull(marketId, "MCP_CONSULTA", "MCP", name, "mcp-v1", null, 0, 0,
                (int) (System.currentTimeMillis() - started), AiUsageLog.Outcome.OK, null, 0d, "TEMPLATE", 0, false);
        } catch (Exception e) {
            r.putArray("content").addObject().put("type", "text").put("text", "Não foi possível consultar agora: " + e.getMessage());
            r.put("isError", true);
            usage.recordFull(marketId, "MCP_CONSULTA", "MCP", name, "mcp-v1", null, 0, 0,
                (int) (System.currentTimeMillis() - started), AiUsageLog.Outcome.ERRO, e.getMessage(), 0d, "TEMPLATE", 0, false);
        } finally {
            if (previous != null) {
                TenantContext.set(previous);
            } else {
                TenantContext.clear();
            }
        }
        return result(id, r);
    }

    private ObjectNode result(JsonNode id, JsonNode result) {
        ObjectNode out = mapper.createObjectNode();
        out.put("jsonrpc", "2.0");
        out.set("id", id);
        out.set("result", result);
        return out;
    }

    public List<String> toolNames() {
        return List.copyOf(tools.keySet());
    }
}
