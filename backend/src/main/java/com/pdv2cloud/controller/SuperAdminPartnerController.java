package com.pdv2cloud.controller;

import com.pdv2cloud.service.partner.PartnerAuthService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Programa de parceiros: cadastro do ERP (o segredo aparece uma única vez),
 * homologação pelo que o parceiro de fato fez na API, lista pública e suspensão.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/super-admin/partners")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SuperAdminPartnerController {

    private static final Set<String> STATUSES = Set.of("REGISTRADO", "HOMOLOGADO", "SUSPENSO");

    private final NamedParameterJdbcTemplate jdbc;
    private final PartnerAuthService auth;

    public SuperAdminPartnerController(NamedParameterJdbcTemplate jdbc, PartnerAuthService auth) {
        this.jdbc = jdbc;
        this.auth = auth;
    }

    /** Lista com o roteiro de homologação medido nos registros da própria API. */
    @GetMapping
    public List<Map<String, Object>> list() {
        return TenantContext.runAsSystem(() -> {
            List<Map<String, Object>> rows = jdbc.queryForList(
                "select p.id, p.name, p.contact_email as \"contactEmail\", p.website, p.client_id as \"clientId\", p.status, " +
                "  p.public_listing as \"publicListing\", p.webhook_url is not null as \"webhook\", p.created_at as \"createdAt\", " +
                "  (select count(*) from partner_market_links l where l.partner_id = p.id and l.status = 'ATIVO') as markets, " +
                "  (select max(at) from partner_api_log a where a.partner_id = p.id) as \"lastCallAt\", " +
                "  exists(select 1 from partner_api_log a where a.partner_id = p.id and a.dry_run and a.status = 200) as dry_run_ok, " +
                "  exists(select 1 from partner_api_log a where a.partner_id = p.id and a.path like '%/products' and not a.dry_run and a.accepted > 0) as products_ok, " +
                "  exists(select 1 from partner_api_log a where a.partner_id = p.id and a.path like '%/stock' and not a.dry_run and a.accepted > 0) as stock_ok, " +
                "  exists(select 1 from partner_api_log a where a.partner_id = p.id and a.path like '%/prices' and not a.dry_run and a.accepted > 0) as prices_ok, " +
                "  exists(select 1 from partner_api_log a where a.partner_id = p.id and a.path like '%/costs' and not a.dry_run and a.accepted > 0) as costs_ok, " +
                "  exists(select 1 from partner_idempotency i where i.partner_id = p.id) as idempotency_ok, " +
                "  exists(select 1 from partner_api_log a where a.partner_id = p.id and a.path like '%/inbound-%' and a.status = 200) as inbound_ok, " +
                "  exists(select 1 from partner_webhook_events e where e.partner_id = p.id and e.status = 'ENTREGUE') as webhook_ok " +
                "from integration_partners p order by p.created_at desc", Map.of());
            for (Map<String, Object> r : rows) {
                Map<String, Object> checklist = new LinkedHashMap<>();
                checklist.put("Testou em modo de teste (dryRun)", r.remove("dry_run_ok"));
                checklist.put("Enviou produtos", r.remove("products_ok"));
                checklist.put("Enviou estoque", r.remove("stock_ok"));
                checklist.put("Enviou preços", r.remove("prices_ok"));
                checklist.put("Enviou custos", r.remove("costs_ok"));
                checklist.put("Usou Idempotency-Key", r.remove("idempotency_ok"));
                checklist.put("Consumiu as entradas prontas", r.remove("inbound_ok"));
                checklist.put("Recebeu um aviso (webhook)", r.remove("webhook_ok"));
                r.put("checklist", checklist);
            }
            return rows;
        });
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        String name = body.get("name") == null ? "" : String.valueOf(body.get("name")).trim();
        if (name.isEmpty() || name.length() > 200) throw new IllegalArgumentException("Informe o nome do ERP.");
        String clientId = "mfc_" + PartnerAuthService.randomToken(12);
        String secret = "mfs_" + PartnerAuthService.randomToken(32);
        UUID id = TenantContext.runAsSystem(() -> jdbc.queryForObject(
            "insert into integration_partners (name, contact_email, website, client_id, secret_hash) values (:n, :e, :w, :c, :h) returning id",
            new MapSqlParameterSource("n", name).addValue("e", text(body.get("contactEmail")))
                .addValue("w", text(body.get("website"))).addValue("c", clientId).addValue("h", auth.hashSecret(secret)), UUID.class));
        return credentials(id, clientId, secret);
    }

    /** Gera um segredo novo (o antigo deixa de valer, e os tokens emitidos com ele também). */
    @PostMapping("/{partnerId}/rotate-secret")
    public Map<String, Object> rotate(@PathVariable("partnerId") UUID partnerId) {
        String secret = "mfs_" + PartnerAuthService.randomToken(32);
        String clientId = TenantContext.runAsSystem(() -> {
            jdbc.update("delete from partner_tokens where partner_id = :p", new MapSqlParameterSource("p", partnerId));
            return jdbc.queryForObject("update integration_partners set secret_hash = :h, updated_at = now() where id = :p returning client_id",
                new MapSqlParameterSource("p", partnerId).addValue("h", auth.hashSecret(secret)), String.class);
        });
        return credentials(partnerId, clientId, secret);
    }

    @PostMapping("/{partnerId}/status")
    public Map<String, Object> status(@PathVariable("partnerId") UUID partnerId, @RequestBody Map<String, Object> body) {
        String status = String.valueOf(body.get("status"));
        if (!STATUSES.contains(status)) throw new IllegalArgumentException("Situação inválida.");
        Boolean listing = body.get("publicListing") instanceof Boolean b ? b : null;
        TenantContext.runAsSystem(() -> {
            jdbc.update("update integration_partners set status = :s, " +
                "public_listing = case when :s = 'HOMOLOGADO' then coalesce(cast(:l as boolean), public_listing) else false end, " +
                "updated_at = now() where id = :p",
                new MapSqlParameterSource("p", partnerId).addValue("s", status).addValue("l", listing));
            if ("SUSPENSO".equals(status)) {
                jdbc.update("delete from partner_tokens where partner_id = :p", new MapSqlParameterSource("p", partnerId));
            }
        });
        return Map.of("ok", true);
    }

    private static String text(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s.substring(0, Math.min(255, s.length()));
    }

    private static Map<String, Object> credentials(UUID id, String clientId, String secret) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("partnerId", id);
        out.put("clientId", clientId);
        out.put("clientSecret", secret);
        out.put("aviso", "Guarde o segredo agora: ele não aparece de novo.");
        return out;
    }
}
