package com.pdv2cloud.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.pdv2cloud.service.ai.mcp.McpKeyService;
import com.pdv2cloud.service.ai.mcp.McpServer;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Servidor MCP do MercadoFlow (HTTP, JSON-RPC 2.0, sem sessão). Público porque
 * quem chama é um agente externo sem JWT: a autenticação é a chave MCP do
 * mercado no cabeçalho Authorization (Bearer mfmcp_...).
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/mcp")
public class McpController {

    /** Chamadas por minuto, por chave. */
    static final int RATE_PER_MINUTE = 60;

    private final McpKeyService keys;
    private final McpServer server;
    private final ObjectMapper mapper = new ObjectMapper();
    private final Map<UUID, long[]> windows = new ConcurrentHashMap<>();

    public McpController(McpKeyService keys, McpServer server) {
        this.keys = keys;
        this.server = server;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> rpc(@RequestHeader(name = "Authorization", required = false) String auth,
                                        @RequestBody(required = false) String body) {
        String secret = auth != null && auth.startsWith("Bearer ") ? auth.substring(7).trim() : null;
        Optional<McpKeyService.Resolved> key = keys.resolve(secret);
        if (key.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .header("WWW-Authenticate", "Bearer realm=\"mercadoflow-mcp\"")
                .body(json(server.error(null, -32001, "Chave MCP inválida ou revogada")));
        }
        if (!allow(key.get().keyId())) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(json(server.error(null, -32002, "Limite de " + RATE_PER_MINUTE + " chamadas por minuto")));
        }
        JsonNode msg;
        try {
            msg = mapper.readTree(body == null ? "" : body);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(json(server.error(null, -32700, "JSON inválido")));
        }
        if (msg == null || msg.isMissingNode()) {
            return ResponseEntity.badRequest().body(json(server.error(null, -32600, "Requisição vazia")));
        }
        UUID market = key.get().marketId();
        if (msg.isArray()) {
            ArrayNode out = mapper.createArrayNode();
            for (JsonNode m : msg) {
                ObjectNode r = server.handle(m, market);
                if (r != null) {
                    out.add(r);
                }
            }
            return out.isEmpty() ? ResponseEntity.accepted().build() : ResponseEntity.ok(json(out));
        }
        ObjectNode r = server.handle(msg, market);
        return r == null ? ResponseEntity.accepted().build() : ResponseEntity.ok(json(r));
    }

    /** Sem fluxo de eventos (SSE): o servidor só responde a requisições. */
    @GetMapping
    public ResponseEntity<Void> stream() {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).header("Allow", "POST").build();
    }

    /** JSON pronto: a resposta sai exatamente como o protocolo pede, sem passar pelo conversor da aplicação. */
    private String json(JsonNode node) {
        try {
            return mapper.writeValueAsString(node);
        } catch (Exception e) {
            return "{\"jsonrpc\":\"2.0\",\"id\":null,\"error\":{\"code\":-32603,\"message\":\"Erro interno\"}}";
        }
    }

    private boolean allow(UUID keyId) {
        long minute = System.currentTimeMillis() / 60_000;
        long[] w = windows.compute(keyId, (k, cur) -> cur == null || cur[0] != minute ? new long[] {minute, 1} : new long[] {minute, cur[1] + 1});
        return w[1] <= RATE_PER_MINUTE;
    }
}
