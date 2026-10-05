package com.pdv2cloud.controller;

import com.pdv2cloud.service.industry.IndustryAccessService;
import com.pdv2cloud.service.industry.IndustryAdminService;
import com.pdv2cloud.service.industry.IndustryDataService;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Portal da indústria: só agregados anônimos dos produtos aprovados da empresa.
 * Nenhuma rota daqui devolve nome de mercado, nota, caixa ou cliente.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/industry")
@PreAuthorize("hasRole('INDUSTRY_USER')")
public class IndustryPortalController {

    private final IndustryAccessService access;
    private final IndustryDataService data;
    private final IndustryAdminService admin;
    private final NamedParameterJdbcTemplate jdbc;

    public IndustryPortalController(IndustryAccessService access, IndustryDataService data, IndustryAdminService admin,
                                    NamedParameterJdbcTemplate jdbc) {
        this.access = access;
        this.data = data;
        this.admin = admin;
        this.jdbc = jdbc;
    }

    /** Empresa, situação e contrato. Responde mesmo sem contrato, para o portal explicar o que falta. */
    @GetMapping("/me")
    public Map<String, Object> me(@AuthenticationPrincipal UserDetails user) {
        Map<String, Object> base = access.industryOf(user.getUsername());
        Map<String, Object> out = new LinkedHashMap<>(base);
        try {
            IndustryAccessService.Context ctx = access.forUser(user.getUsername());
            Map<String, Object> c = jdbc.queryForMap("select c.number, c.plan, p.name as plan_name, c.features, c.scope_ufs, c.scope_cities, "
                + "c.allow_neighborhood, c.gtin_limit, c.starts_on, c.ends_on from industry_contracts c join industry_plans p on p.code = c.plan "
                + "where c.id = :id", Map.of("id", ctx.contractId()));
            Map<String, Object> contract = new LinkedHashMap<>(c);
            contract.put("features", ctx.features());
            contract.put("scope_ufs", ctx.scopeUfs());
            contract.put("scope_cities", ctx.scopeCities());
            out.put("contract", contract);
            out.put("access", true);
        } catch (IndustryAccessService.Denied e) {
            out.put("contract", null);
            out.put("access", false);
            out.put("message", e.getMessage());
        }
        out.put("approvedProducts", jdbc.queryForObject("select count(*) from industry_portfolio where industry_id = :i and status = 'APROVADO'",
            Map.of("i", base.get("id")), Integer.class));
        return out;
    }

    @GetMapping("/overview")
    public Map<String, Object> overview(@AuthenticationPrincipal UserDetails user) {
        return data.overview(access.forUser(user.getUsername()));
    }

    @GetMapping("/map")
    public Map<String, Object> map(@AuthenticationPrincipal UserDetails user, @RequestParam(required = false) String level,
                                   @RequestParam(required = false) String uf, @RequestParam(required = false) String cityCode,
                                   @RequestParam(required = false) String gtin, @RequestParam(defaultValue = "28") int days) {
        return data.map(access.forUser(user.getUsername()), level, uf, cityCode, gtin, days);
    }

    @GetMapping("/products/{gtin}")
    public Map<String, Object> product(@AuthenticationPrincipal UserDetails user, @PathVariable String gtin,
                                       @RequestParam(required = false) String uf, @RequestParam(required = false) String cityCode,
                                       @RequestParam(defaultValue = "day") String grain, @RequestParam(defaultValue = "90") int days) {
        return data.product(access.forUser(user.getUsername()), gtin, uf, cityCode, grain, days);
    }

    @GetMapping("/hourly")
    public Map<String, Object> hourly(@AuthenticationPrincipal UserDetails user, @RequestParam(required = false) String gtin,
                                      @RequestParam(required = false) String uf, @RequestParam(required = false) String cityCode) {
        return data.hourly(access.forUser(user.getUsername()), gtin, uf, cityCode);
    }

    @GetMapping("/category")
    public Map<String, Object> category(@AuthenticationPrincipal UserDetails user, @RequestParam(required = false) String uf) {
        return data.category(access.forUser(user.getUsername()), uf);
    }

    @GetMapping("/coverage")
    public Map<String, Object> coverage(@AuthenticationPrincipal UserDetails user) {
        return data.coverage(access.forUser(user.getUsername()));
    }

    @GetMapping("/export.csv")
    public ResponseEntity<byte[]> export(@AuthenticationPrincipal UserDetails user, @RequestParam(defaultValue = "CIDADE") String level,
                                         @RequestParam(defaultValue = "30") int days) {
        String csv = data.exportCsv(access.forUser(user.getUsername()), level, days);
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"mercadoflow-industria.csv\"")
            .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
            .body(("﻿" + csv).getBytes(StandardCharsets.UTF_8));
    }

    /** Carteira da empresa: só a situação de cada pedido, sem dizer de quem é um GTIN recusado. */
    @GetMapping("/products")
    public List<Map<String, Object>> portfolio(@AuthenticationPrincipal UserDetails user) {
        UUID id = (UUID) access.industryOf(user.getUsername()).get("id");
        return jdbc.queryForList("select gtin, product_name, brand, status, requested_at, decided_at, "
            + "case when status in ('NEGADO', 'REVOGADO') then decision_note end as decision_note "
            + "from industry_portfolio where industry_id = :i order by status = 'APROVADO' desc, product_name", Map.of("i", id));
    }

    @PostMapping("/products/requests")
    public Map<String, Object> request(@AuthenticationPrincipal UserDetails user, @RequestBody Map<String, Object> body) {
        Map<String, Object> ind = access.industryOf(user.getUsername());
        if (!"ATIVA".equals(ind.get("status"))) {
            throw new IndustryAccessService.Denied(403, "O cadastro da sua empresa precisa estar aprovado para pedir produtos.");
        }
        List<String> gtins = com.pdv2cloud.service.industry.IndustryAdminService.strings(body.get("gtins"));
        if (gtins.size() > 500) {
            throw new IllegalArgumentException("Envie até 500 códigos por vez.");
        }
        Map<String, Object> out = admin.request((UUID) ind.get("id"), gtins, user.getUsername());
        out.remove("saved");
        return out;
    }

    @ExceptionHandler(IndustryAccessService.Denied.class)
    public ResponseEntity<Map<String, Object>> denied(IndustryAccessService.Denied e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", e.status() == 429 ? "rate_limited" : "industry_access");
        body.put("message", e.getMessage());
        body.put("userMessage", e.getMessage());
        return ResponseEntity.status(e.status()).body(body);
    }
}
