package com.pdv2cloud.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.security.PartnerPrincipal;
import com.pdv2cloud.service.partner.PartnerAuthService;
import com.pdv2cloud.service.partner.PartnerIngestService;
import com.pdv2cloud.service.partner.PartnerOutboundService;
import com.pdv2cloud.service.partner.PartnerScopes;
import com.pdv2cloud.tenancy.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * API dos ERPs parceiros (docs/PROPOSTA-DECISOES-E-INTEGRACAO.md).
 * Entra: catálogo, custo, preço, estoque, notas de entrada, fornecedores.
 * Sai: só a entrada de mercadoria pronta (notas do Confere), com troca obrigatória.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/partner")
public class PartnerApiController {

    private final PartnerAuthService auth;
    private final PartnerIngestService ingest;
    private final PartnerOutboundService outbound;
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final String publicBaseUrl;

    public PartnerApiController(PartnerAuthService auth, PartnerIngestService ingest, PartnerOutboundService outbound,
                                NamedParameterJdbcTemplate jdbc,
                                @Value("${app.public-base-url:https://mercadoflow.com}") String publicBaseUrl) {
        this.auth = auth;
        this.ingest = ingest;
        this.outbound = outbound;
        this.jdbc = jdbc;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
    }

    private static Map<String, Object> error(String message) {
        return Map.of("erro", message);
    }

    // ---------------------------------------------------------------- acesso

    /** OAuth2 client credentials, em formulário (padrão do OAuth2). */
    @PostMapping(value = "/oauth/token", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<?> tokenForm(@RequestParam Map<String, String> form) {
        return issue(form);
    }

    /** O mesmo, em JSON. */
    @PostMapping(value = "/oauth/token", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> tokenJson(@RequestBody Map<String, Object> body) {
        Map<String, String> form = new LinkedHashMap<>();
        body.forEach((k, v) -> form.put(k, v == null ? null : String.valueOf(v)));
        return issue(form);
    }

    private ResponseEntity<?> issue(Map<String, String> form) {
        if (form.get("grant_type") != null && !"client_credentials".equals(form.get("grant_type"))) {
            return ResponseEntity.badRequest().body(Map.of("error", "unsupported_grant_type"));
        }
        PartnerAuthService.Issued issued = auth.issue(form.get("client_id"), form.get("client_secret"));
        if (issued == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "invalid_client"));
        }
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(issued);
    }

    @GetMapping(value = "/openapi.yaml", produces = "application/yaml")
    public ResponseEntity<String> openapi() throws Exception {
        try (InputStream in = new ClassPathResource("partner-openapi.yaml").getInputStream()) {
            return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/yaml;charset=UTF-8"))
                .body(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    /** Quem sou eu e quais lojas me autorizaram (com os escopos e a troca em dia). */
    @GetMapping("/me")
    public Map<String, Object> me(Authentication authentication) {
        PartnerPrincipal p = (PartnerPrincipal) authentication.getPrincipal();
        return TenantContext.runAsSystem(() -> {
            Map<String, Object> info = jdbc.queryForMap(
                "select name, status, webhook_url is not null as webhook from integration_partners where id = :p",
                new MapSqlParameterSource("p", p.partnerId()));
            List<Map<String, Object>> markets = jdbc.queryForList(
                "select l.market_id as \"marketId\", m.name, l.scopes::text as scopes, l.authorized_at as \"authorizedAt\", " +
                "  l.last_stock_at as \"lastStockAt\", l.last_prices_at as \"lastPricesAt\", l.last_costs_at as \"lastCostsAt\" " +
                "from partner_market_links l join markets m on m.id = l.market_id where l.partner_id = :p and l.status = 'ATIVO' order by m.name",
                new MapSqlParameterSource("p", p.partnerId()));
            for (Map<String, Object> m : markets) {
                String s = String.valueOf(m.get("scopes"));
                m.put("scopes", s.length() > 2 ? List.of(s.substring(1, s.length() - 1).split(",")) : List.of());
                m.put("inboundAvailable", outbound.reciprocityProblem(p.partnerId(), (UUID) m.get("marketId")) == null);
            }
            Map<String, Object> out = new LinkedHashMap<>(info);
            out.put("partnerId", p.partnerId());
            out.put("markets", markets);
            out.put("reciprocityDays", PartnerOutboundService.RECIPROCITY_DAYS);
            out.put("requestsPerMinute", PartnerAuthService.REQUESTS_PER_MINUTE);
            return out;
        });
    }

    /** Endereço para os avisos (pedido enviado, preço aprovado). Devolve o segredo da assinatura uma única vez. */
    @PutMapping("/webhook")
    public ResponseEntity<?> webhook(@RequestBody Map<String, Object> body, Authentication authentication) {
        PartnerPrincipal p = (PartnerPrincipal) authentication.getPrincipal();
        String url = body.get("url") == null ? null : String.valueOf(body.get("url")).trim();
        if (url != null && url.isEmpty()) url = null;
        if (url != null) {
            URI u;
            try {
                u = URI.create(url);
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(error("URL inválida."));
            }
            if (!"https".equalsIgnoreCase(u.getScheme()) || u.getHost() == null) {
                return ResponseEntity.badRequest().body(error("Use uma URL https."));
            }
        }
        String secret = url == null ? null : "whsec_" + PartnerAuthService.randomToken(24);
        String finalUrl = url;
        TenantContext.runAsSystem(() -> jdbc.update(
            "update integration_partners set webhook_url = :u, webhook_secret = :s, updated_at = now() where id = :p",
            new MapSqlParameterSource("u", finalUrl).addValue("s", secret).addValue("p", p.partnerId())));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("url", url);
        out.put("secret", secret);
        out.put("signatureHeader", "X-MercadoFlow-Signature");
        out.put("algorithm", "HMAC-SHA256 do corpo, em hexadecimal, com o prefixo sha256=");
        return ResponseEntity.ok(out);
    }

    // ---------------------------------------------------------------- entrada

    private boolean hasScope(HttpServletRequest request, String scope) {
        Object s = request.getAttribute("partnerScopes");
        return s instanceof List<?> l && l.contains(scope);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> items(Map<String, Object> body) {
        Object items = body == null ? null : body.get("items");
        if (!(items instanceof List<?> l)) throw new IllegalArgumentException("Envie { \"items\": [ ... ] }.");
        if (l.size() > PartnerIngestService.MAX_BATCH) {
            throw new IllegalArgumentException("Até " + PartnerIngestService.MAX_BATCH + " itens por lote.");
        }
        return l.stream().map(o -> o instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.<String, Object>of()).toList();
    }

    private void log(UUID partnerId, UUID marketId, String method, String path, PartnerIngestService.BatchResult r, int status) {
        TenantContext.runAsSystem(() -> jdbc.update(
            "insert into partner_api_log (partner_id, market_id, method, path, items, accepted, rejected, status, dry_run) " +
            "values (:p, :m, :me, :pa, :i, :a, :r, :s, :d)",
            new MapSqlParameterSource("p", partnerId).addValue("m", marketId).addValue("me", method).addValue("pa", path)
                .addValue("i", r == null ? 0 : r.received()).addValue("a", r == null ? 0 : r.accepted())
                .addValue("r", r == null ? 0 : r.rejected()).addValue("s", status).addValue("d", r != null && r.dryRun())));
    }

    @FunctionalInterface
    private interface Batch {
        PartnerIngestService.BatchResult run(UUID partnerId, List<Map<String, Object>> items, boolean dryRun);
    }

    private ResponseEntity<?> handle(UUID marketId, String resource, String scope, Map<String, Object> body, boolean dryRun,
                                     String idemKey, HttpServletRequest request, Authentication authentication, Batch batch) {
        PartnerPrincipal p = (PartnerPrincipal) authentication.getPrincipal();
        String path = "/markets/{id}/" + resource;
        if (!hasScope(request, scope)) {
            log(p.partnerId(), marketId, "POST", path, null, 403);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(error("A loja não autorizou o escopo " + scope + ". Peça a autorização em Integrações, no painel da loja."));
        }
        String key = idemKey == null || idemKey.isBlank() || dryRun ? null : idemKey.trim();
        if (key != null && key.length() > 120) return ResponseEntity.badRequest().body(error("Idempotency-Key com até 120 caracteres."));
        if (key != null) {
            List<String> saved = TenantContext.runAsSystem(() -> jdbc.queryForList(
                "select response::text from partner_idempotency where partner_id = :p and idem_key = :k and market_id = :m and path = :pa " +
                "and created_at > now() - interval '24 hours'",
                new MapSqlParameterSource("p", p.partnerId()).addValue("k", key).addValue("m", marketId).addValue("pa", path), String.class));
            if (!saved.isEmpty()) {
                return ResponseEntity.ok().header("Idempotent-Replay", "true").contentType(MediaType.APPLICATION_JSON).body(saved.get(0));
            }
        }
        PartnerIngestService.BatchResult result;
        try {
            result = batch.run(p.partnerId(), items(body), dryRun);
        } catch (IllegalArgumentException e) {
            log(p.partnerId(), marketId, "POST", path, null, 400);
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
        log(p.partnerId(), marketId, "POST", path, result, 200);
        if (key != null) {
            try {
                String response = json.writeValueAsString(result);
                TenantContext.runAsSystem(() -> jdbc.update(
                    "delete from partner_idempotency where created_at < now() - interval '24 hours'", Map.of()));
                TenantContext.runAsSystem(() -> jdbc.update(
                    "insert into partner_idempotency (partner_id, idem_key, market_id, path, response) values (:p, :k, :m, :pa, cast(:r as jsonb)) " +
                    "on conflict (partner_id, idem_key) do update set response = excluded.response, market_id = excluded.market_id, " +
                    "path = excluded.path, created_at = now()",
                    new MapSqlParameterSource("p", p.partnerId()).addValue("k", key).addValue("m", marketId)
                        .addValue("pa", path).addValue("r", response)));
            } catch (Exception ignored) {
                // a idempotência é uma garantia extra: falhar aqui não desfaz o lote gravado
            }
        }
        return ResponseEntity.ok(result);
    }

    @PostMapping("/markets/{id}/products")
    public ResponseEntity<?> products(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body,
                                      @RequestParam(value = "dryRun", defaultValue = "false") boolean dryRun,
                                      @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                      HttpServletRequest request, Authentication authentication) {
        return handle(id, "products", PartnerScopes.CATALOG_WRITE, body, dryRun, key, request, authentication,
            (p, items, dry) -> ingest.products(id, items, dry));
    }

    @PostMapping("/markets/{id}/suppliers")
    public ResponseEntity<?> suppliers(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body,
                                       @RequestParam(value = "dryRun", defaultValue = "false") boolean dryRun,
                                       @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                       HttpServletRequest request, Authentication authentication) {
        return handle(id, "suppliers", PartnerScopes.CATALOG_WRITE, body, dryRun, key, request, authentication,
            (p, items, dry) -> ingest.suppliers(id, items, dry));
    }

    @PostMapping("/markets/{id}/costs")
    public ResponseEntity<?> costs(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body,
                                   @RequestParam(value = "dryRun", defaultValue = "false") boolean dryRun,
                                   @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                   HttpServletRequest request, Authentication authentication) {
        return handle(id, "costs", PartnerScopes.COSTS_WRITE, body, dryRun, key, request, authentication,
            (p, items, dry) -> ingest.costs(p, id, items, dry));
    }

    @PostMapping("/markets/{id}/prices")
    public ResponseEntity<?> prices(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body,
                                    @RequestParam(value = "dryRun", defaultValue = "false") boolean dryRun,
                                    @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                    HttpServletRequest request, Authentication authentication) {
        return handle(id, "prices", PartnerScopes.PRICES_WRITE, body, dryRun, key, request, authentication,
            (p, items, dry) -> ingest.prices(p, id, items, dry));
    }

    @PostMapping("/markets/{id}/stock")
    public ResponseEntity<?> stock(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body,
                                   @RequestParam(value = "dryRun", defaultValue = "false") boolean dryRun,
                                   @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                   HttpServletRequest request, Authentication authentication) {
        return handle(id, "stock", PartnerScopes.STOCK_WRITE, body, dryRun, key, request, authentication,
            (p, items, dry) -> ingest.stock(p, id, items, dry));
    }

    @PostMapping("/markets/{id}/receipts")
    public ResponseEntity<?> receipts(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body,
                                      @RequestParam(value = "dryRun", defaultValue = "false") boolean dryRun,
                                      @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                      HttpServletRequest request, Authentication authentication) {
        return handle(id, "receipts", PartnerScopes.RECEIPTS_WRITE, body, dryRun, key, request, authentication,
            (p, items, dry) -> ingest.receipts(id, items, dry));
    }

    // ---------------------------------------------------------------- saída (entrada pronta)

    private ResponseEntity<?> inbound(UUID marketId, String resource, String since, HttpServletRequest request,
                                      Authentication authentication, java.util.function.Function<LocalDateTime, Map<String, Object>> fetch) {
        PartnerPrincipal p = (PartnerPrincipal) authentication.getPrincipal();
        String path = "/markets/{id}/" + resource;
        if (!hasScope(request, PartnerScopes.INBOUND_READ)) {
            log(p.partnerId(), marketId, "GET", path, null, 403);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(error("A loja não autorizou o escopo " + PartnerScopes.INBOUND_READ + "."));
        }
        String problem = outbound.reciprocityProblem(p.partnerId(), marketId);
        if (problem != null) {
            log(p.partnerId(), marketId, "GET", path, null, 409);
            return ResponseEntity.status(HttpStatus.CONFLICT).body(error(problem));
        }
        LocalDateTime from;
        try {
            from = since == null || since.isBlank() ? LocalDateTime.now().minusDays(30) : LocalDateTime.parse(since.replace("Z", ""));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(error("since no formato 2026-10-01T00:00:00."));
        }
        Map<String, Object> out = fetch.apply(from);
        int n = out.get("items") instanceof List<?> l ? l.size() : 0;
        log(p.partnerId(), marketId, "GET", path, new PartnerIngestService.BatchResult(n, n, 0, false, List.of()), 200);
        return ResponseEntity.ok(out);
    }

    @GetMapping("/markets/{id}/inbound-products")
    public ResponseEntity<?> inboundProducts(@PathVariable("id") UUID id, @RequestParam(value = "since", required = false) String since,
                                             @RequestParam(value = "limit", defaultValue = "200") int limit,
                                             HttpServletRequest request, Authentication authentication) {
        return inbound(id, "inbound-products", since, request, authentication,
            from -> outbound.inboundProducts(id, from, limit, publicBaseUrl));
    }

    @GetMapping("/markets/{id}/inbound-receipts")
    public ResponseEntity<?> inboundReceipts(@PathVariable("id") UUID id, @RequestParam(value = "since", required = false) String since,
                                             @RequestParam(value = "limit", defaultValue = "50") int limit,
                                             HttpServletRequest request, Authentication authentication) {
        return inbound(id, "inbound-receipts", since, request, authentication,
            from -> outbound.inboundReceipts(id, from, limit));
    }
}
