package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.notify.EmailService;
import com.pdv2cloud.service.partner.PartnerOutboundService;
import com.pdv2cloud.service.partner.PartnerScopes;
import java.sql.Array;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** A loja decide quais ERPs entram, com quais escopos, e vê tudo o que cada um enviou. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{id}/integrations")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class MarketIntegrationController {

    private final MarketAccessService access;
    private final NamedParameterJdbcTemplate jdbc;
    private final PartnerOutboundService outbound;
    private final EmailService email;

    public MarketIntegrationController(MarketAccessService access, NamedParameterJdbcTemplate jdbc,
                                       PartnerOutboundService outbound, EmailService email) {
        this.access = access;
        this.jdbc = jdbc;
        this.outbound = outbound;
        this.email = email;
    }

    private static List<String> strings(Object array) {
        try {
            if (array instanceof Array a) return List.of((String[]) a.getArray());
        } catch (Exception ignored) {
            // cai no vazio
        }
        return List.of();
    }

    @GetMapping
    public Map<String, Object> overview(@PathVariable("id") UUID id, Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        // Parceiros visíveis: os homologados da lista pública e os que já têm vínculo com esta loja.
        List<Map<String, Object>> partners = jdbc.queryForList(
            "select p.id, p.name, p.website, p.status, l.scopes, l.status as link_status, l.authorized_at, l.authorized_by, " +
            "  l.last_stock_at, l.last_prices_at, l.last_costs_at, " +
            "  (select max(at) from partner_api_log a where a.partner_id = p.id and a.market_id = :m) as last_call " +
            "from integration_partners p left join partner_market_links l on l.partner_id = p.id and l.market_id = :m " +
            "where (p.status = 'HOMOLOGADO' and p.public_listing) or l.id is not null " +
            "order by (l.status = 'ATIVO') desc nulls last, p.name",
            new MapSqlParameterSource("m", id));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> p : partners) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("partnerId", p.get("id"));
            m.put("name", p.get("name"));
            m.put("website", p.get("website"));
            m.put("homologated", "HOMOLOGADO".equals(p.get("status")));
            m.put("suspended", "SUSPENSO".equals(p.get("status")));
            boolean active = "ATIVO".equals(p.get("link_status"));
            m.put("authorized", active);
            m.put("scopes", active ? strings(p.get("scopes")) : List.of());
            m.put("authorizedAt", p.get("authorized_at"));
            m.put("authorizedBy", p.get("authorized_by"));
            m.put("lastStockAt", p.get("last_stock_at"));
            m.put("lastPricesAt", p.get("last_prices_at"));
            m.put("lastCostsAt", p.get("last_costs_at"));
            m.put("lastCallAt", p.get("last_call"));
            m.put("receivesInbound", active && outbound.reciprocityProblem((UUID) p.get("id"), id) == null);
            out.add(m);
        }
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("partners", out);
        res.put("scopes", PartnerScopes.LABELS);
        res.put("reciprocityDays", PartnerOutboundService.RECIPROCITY_DAYS);
        res.put("requests", jdbc.queryForList(
            "select erp_name as \"erpName\", vendor_email as \"vendorEmail\", created_at as \"createdAt\", emailed " +
            "from erp_integration_requests where market_id = :m order by created_at desc limit 20",
            new MapSqlParameterSource("m", id)));
        return res;
    }

    /** Achar um parceiro pelo código que o próprio ERP passou ao lojista (mesmo fora da lista pública). */
    @GetMapping("/lookup")
    public Map<String, Object> lookup(@PathVariable("id") UUID id, @RequestParam("clientId") String clientId,
                                      Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select id as \"partnerId\", name, website, status from integration_partners where client_id = :c and status <> 'SUSPENSO'",
            new MapSqlParameterSource("c", clientId.trim()));
        if (rows.isEmpty()) throw new IllegalArgumentException("Nenhum ERP com este código. Confira com o fornecedor do seu sistema.");
        return rows.get(0);
    }

    @PostMapping("/partners/{partnerId}/authorize")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'ADMIN')")
    public Map<String, Object> authorize(@PathVariable("id") UUID id, @PathVariable("partnerId") UUID partnerId,
                                         @RequestBody Map<String, Object> body, Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        List<String> scopes = new ArrayList<>();
        if (body.get("scopes") instanceof List<?> l) {
            for (Object o : l) {
                String s = String.valueOf(o);
                if (PartnerScopes.LABELS.containsKey(s) && !scopes.contains(s)) scopes.add(s);
            }
        }
        if (scopes.isEmpty()) throw new IllegalArgumentException("Escolha ao menos uma permissão.");
        Integer exists = jdbc.queryForObject("select count(*) from integration_partners where id = :p and status <> 'SUSPENSO'",
            new MapSqlParameterSource("p", partnerId), Integer.class);
        if (exists == null || exists == 0) throw new IllegalArgumentException("Este ERP não está disponível.");
        jdbc.update(
            "insert into partner_market_links (partner_id, market_id, scopes, status, authorized_by, authorized_at) " +
            "values (:p, :m, cast(:s as text[]), 'ATIVO', :u, now()) " +
            "on conflict (partner_id, market_id) do update set scopes = excluded.scopes, status = 'ATIVO', " +
            "authorized_by = excluded.authorized_by, authorized_at = now(), revoked_at = null",
            new MapSqlParameterSource("p", partnerId).addValue("m", id).addValue("u", authentication.getName())
                .addValue("s", "{" + String.join(",", scopes) + "}"));
        return Map.of("ok", true, "scopes", scopes);
    }

    @PostMapping("/partners/{partnerId}/revoke")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'ADMIN')")
    public Map<String, Object> revoke(@PathVariable("id") UUID id, @PathVariable("partnerId") UUID partnerId,
                                      Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        int n = jdbc.update("update partner_market_links set status = 'REVOGADO', revoked_at = now() " +
            "where partner_id = :p and market_id = :m and status = 'ATIVO'",
            new MapSqlParameterSource("p", partnerId).addValue("m", id));
        // Avisos ainda na fila não saem mais.
        jdbc.update("update partner_webhook_events set status = 'FALHOU', last_error = 'acesso revogado pela loja' " +
            "where partner_id = :p and market_id = :m and status = 'PENDENTE'",
            new MapSqlParameterSource("p", partnerId).addValue("m", id));
        return Map.of("ok", n > 0);
    }

    /** O que cada ERP mandou e recebeu desta loja. */
    @GetMapping("/log")
    public List<Map<String, Object>> log(@PathVariable("id") UUID id,
                                         @RequestParam(value = "partnerId", required = false) UUID partnerId,
                                         Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        return jdbc.queryForList(
            "select a.at, p.name as partner, a.method, a.path, a.items, a.accepted, a.rejected, a.status, a.dry_run as \"dryRun\" " +
            "from partner_api_log a join integration_partners p on p.id = a.partner_id " +
            "where a.market_id = :m and (cast(:p as uuid) is null or a.partner_id = :p) order by a.at desc limit 100",
            new MapSqlParameterSource("m", id).addValue("p", partnerId));
    }

    /** "Peça ao seu ERP": registra a demanda e, se der, avisa o fornecedor do sistema. */
    @PostMapping("/erp-request")
    public Map<String, Object> erpRequest(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body,
                                          Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        String erp = body.get("erpName") == null ? "" : String.valueOf(body.get("erpName")).trim();
        if (erp.isEmpty() || erp.length() > 200) throw new IllegalArgumentException("Diga qual é o seu sistema (ERP).");
        String vendor = body.get("vendorEmail") == null ? null : String.valueOf(body.get("vendorEmail")).trim();
        if (vendor != null && vendor.isEmpty()) vendor = null;
        if (vendor != null && !vendor.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) throw new IllegalArgumentException("E-mail do fornecedor inválido.");
        String note = body.get("note") == null ? null : String.valueOf(body.get("note"));
        if (note != null && note.length() > 1000) note = note.substring(0, 1000);
        String market = jdbc.queryForObject("select name from markets where id = :m", new MapSqlParameterSource("m", id), String.class);
        boolean emailed = false;
        if (vendor != null && email.configured()) {
            List<String> paragraphs = new ArrayList<>();
            paragraphs.add("O supermercado " + market + " usa o " + erp + " e pediu a integração com o MercadoFlow.");
            paragraphs.add("Com a integração, o seu sistema passa a receber o cadastro dos produtos e as entradas de mercadoria "
                + "prontas, lidas das notas fiscais de entrada (com embalagem, conversão para unidade de venda e conferência), "
                + "e os pedidos e preços aprovados pelo lojista. Em troca, envia estoque, custo e preço.");
            paragraphs.add("A API é aberta, documentada e tem modo de teste (dryRun). O cadastro de parceiro é gratuito.");
            if (note != null && !note.isBlank()) paragraphs.add("Recado do lojista: " + note);
            emailed = email.send(vendor, market + " pediu a integração com o MercadoFlow", "Integração pedida por um cliente seu",
                paragraphs, "Ver a documentação", email.link("/desenvolvedores")).ok();
        }
        jdbc.update("insert into erp_integration_requests (market_id, erp_name, vendor_email, note, created_by, emailed) " +
            "values (:m, :e, :v, :n, :u, :x)",
            new MapSqlParameterSource("m", id).addValue("e", erp).addValue("v", vendor).addValue("n", note)
                .addValue("u", authentication.getName()).addValue("x", emailed));
        return Map.of("ok", true, "emailed", emailed);
    }
}
