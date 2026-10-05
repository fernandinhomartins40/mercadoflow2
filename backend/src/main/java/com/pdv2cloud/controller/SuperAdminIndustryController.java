package com.pdv2cloud.controller;

import com.pdv2cloud.service.industry.DataParticipationService;
import com.pdv2cloud.service.industry.IndustryAccessService;
import com.pdv2cloud.service.industry.IndustryAdminService;
import com.pdv2cloud.service.industry.IndustryBillingService;
import com.pdv2cloud.service.industry.IndustryDataService;
import com.pdv2cloud.service.industry.MarketLocationService;
import com.pdv2cloud.service.industry.PrivacyPolicyService;
import com.pdv2cloud.service.industry.SellOutAggregator;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.TemporalAdjusters;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Superadmin do MercadoFlow Indústria: empresas, carteira, contratos, prévia, privacidade e cobrança. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/super-admin/industry")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SuperAdminIndustryController {

    private final IndustryAdminService admin;
    private final IndustryAccessService access;
    private final IndustryDataService data;
    private final IndustryBillingService billing;
    private final PrivacyPolicyService policies;
    private final SellOutAggregator aggregator;
    private final MarketLocationService locations;
    private final DataParticipationService participation;
    private final NamedParameterJdbcTemplate jdbc;

    public SuperAdminIndustryController(IndustryAdminService admin, IndustryAccessService access, IndustryDataService data,
                                        IndustryBillingService billing, PrivacyPolicyService policies, SellOutAggregator aggregator,
                                        MarketLocationService locations, DataParticipationService participation,
                                        NamedParameterJdbcTemplate jdbc) {
        this.admin = admin;
        this.access = access;
        this.data = data;
        this.billing = billing;
        this.policies = policies;
        this.aggregator = aggregator;
        this.locations = locations;
        this.participation = participation;
        this.jdbc = jdbc;
    }

    // ── Empresas e acessos ────────────────────────────────────────────────

    @GetMapping("/industries")
    public List<Map<String, Object>> list() {
        return admin.list();
    }

    @PostMapping("/industries")
    public Map<String, Object> create(@RequestBody Map<String, Object> body, Authentication auth) {
        return admin.create(body, auth.getName());
    }

    @GetMapping("/industries/{id}")
    public Map<String, Object> get(@PathVariable UUID id) {
        return admin.get(id);
    }

    @PutMapping("/industries/{id}")
    public Map<String, Object> update(@PathVariable UUID id, @RequestBody Map<String, Object> body, Authentication auth) {
        return admin.update(id, body, auth.getName());
    }

    @PostMapping("/industries/{id}/status")
    public Map<String, Object> status(@PathVariable UUID id, @RequestBody Map<String, Object> body, Authentication auth) {
        return admin.setStatus(id, String.valueOf(body.get("status")), (String) body.get("reason"), auth.getName());
    }

    @PostMapping("/industries/{id}/users")
    public Map<String, Object> createUser(@PathVariable UUID id, @RequestBody Map<String, Object> body, Authentication auth) {
        return admin.createUser(id, body, auth.getName());
    }

    @PostMapping("/industries/{id}/users/{userId}/active")
    public Map<String, Object> userActive(@PathVariable UUID id, @PathVariable UUID userId, @RequestBody Map<String, Object> body,
                                          Authentication auth) {
        return admin.setUserActive(id, userId, Boolean.TRUE.equals(body.get("active")), auth.getName());
    }

    // ── Carteira ──────────────────────────────────────────────────────────

    @GetMapping("/industries/{id}/portfolio")
    public List<Map<String, Object>> portfolio(@PathVariable UUID id, @RequestParam(required = false) String status) {
        return admin.portfolio(id, status);
    }

    @PostMapping("/industries/{id}/portfolio")
    public Map<String, Object> request(@PathVariable UUID id, @RequestBody Map<String, Object> body, Authentication auth) {
        if (body.get("brand") != null && !String.valueOf(body.get("brand")).isBlank()) {
            return admin.requestBrand(id, String.valueOf(body.get("brand")), auth.getName());
        }
        return admin.request(id, IndustryAdminService.strings(body.get("gtins")), auth.getName());
    }

    @PostMapping("/industries/{id}/portfolio/decide")
    public Map<String, Object> decide(@PathVariable UUID id, @RequestBody Map<String, Object> body, Authentication auth) {
        return admin.decide(id, IndustryAdminService.strings(body.get("gtins")), String.valueOf(body.get("decision")),
            (String) body.get("evidenceType"), (String) body.get("evidenceRef"), (String) body.get("note"), auth.getName());
    }

    @GetMapping("/industries/{id}/suppressed")
    public Map<String, Object> suppressed(@PathVariable UUID id, @RequestParam(defaultValue = "28") int days) {
        return admin.suppressed(id, Math.max(7, Math.min(days, 365)));
    }

    @GetMapping("/industries/{id}/audit")
    public Map<String, Object> audit(@PathVariable UUID id) {
        return admin.audit(id, policies.current().maxQueriesPerDay());
    }

    // ── Contratos ─────────────────────────────────────────────────────────

    @GetMapping("/plans")
    public List<Map<String, Object>> plans() {
        return admin.plans();
    }

    @PostMapping("/industries/{id}/contracts")
    public Map<String, Object> createContract(@PathVariable UUID id, @RequestBody Map<String, Object> body, Authentication auth) {
        return admin.createContract(id, body, auth.getName());
    }

    @GetMapping("/contracts/{cid}")
    public Map<String, Object> contract(@PathVariable UUID cid) {
        return admin.contract(cid);
    }

    @PutMapping("/contracts/{cid}")
    public Map<String, Object> updateContract(@PathVariable UUID cid, @RequestBody Map<String, Object> body, Authentication auth) {
        return admin.updateContract(cid, body, auth.getName());
    }

    @PostMapping("/contracts/{cid}/preview-approve")
    public Map<String, Object> approvePreview(@PathVariable UUID cid, Authentication auth) {
        return admin.approvePreview(cid, auth.getName());
    }

    @PostMapping("/contracts/{cid}/activate")
    public Map<String, Object> activate(@PathVariable UUID cid, Authentication auth) {
        return admin.activate(cid, auth.getName());
    }

    @PostMapping("/contracts/{cid}/status")
    public Map<String, Object> contractStatus(@PathVariable UUID cid, @RequestBody Map<String, Object> body, Authentication auth) {
        return admin.setContractStatus(cid, String.valueOf(body.get("status")), (String) body.get("reason"), auth.getName());
    }

    // ── Prévia: exatamente o que a indústria verá ─────────────────────────

    @GetMapping("/contracts/{cid}/preview/overview")
    public Map<String, Object> previewOverview(@PathVariable UUID cid, Authentication auth) {
        return data.overview(access.forPreview(cid, auth.getName()));
    }

    @GetMapping("/contracts/{cid}/preview/map")
    public Map<String, Object> previewMap(@PathVariable UUID cid, Authentication auth, @RequestParam(required = false) String level,
                                          @RequestParam(required = false) String uf, @RequestParam(required = false) String cityCode,
                                          @RequestParam(required = false) String gtin, @RequestParam(defaultValue = "28") int days) {
        return data.map(access.forPreview(cid, auth.getName()), level, uf, cityCode, gtin, days);
    }

    @GetMapping("/contracts/{cid}/preview/products/{gtin}")
    public Map<String, Object> previewProduct(@PathVariable UUID cid, @PathVariable String gtin, Authentication auth,
                                              @RequestParam(required = false) String uf, @RequestParam(required = false) String cityCode,
                                              @RequestParam(defaultValue = "day") String grain, @RequestParam(defaultValue = "90") int days) {
        return data.product(access.forPreview(cid, auth.getName()), gtin, uf, cityCode, grain, days);
    }

    @GetMapping("/contracts/{cid}/preview/category")
    public Map<String, Object> previewCategory(@PathVariable UUID cid, Authentication auth, @RequestParam(required = false) String uf) {
        return data.category(access.forPreview(cid, auth.getName()), uf);
    }

    @GetMapping("/contracts/{cid}/preview/hourly")
    public Map<String, Object> previewHourly(@PathVariable UUID cid, Authentication auth, @RequestParam(required = false) String gtin) {
        return data.hourly(access.forPreview(cid, auth.getName()), gtin, null, null);
    }

    // ── Privacidade e dados ───────────────────────────────────────────────

    @GetMapping("/policy")
    public Map<String, Object> policy() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("policy", policies.current());
        out.put("history", policies.history());
        return out;
    }

    @PutMapping("/policy")
    public Map<String, Object> savePolicy(@RequestBody Map<String, Object> body, Authentication auth) {
        policies.update(body, auth.getName());
        return policy();
    }

    @GetMapping("/data/status")
    public Map<String, Object> dataStatus() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stores", locations.overview());
        out.put("participation", participation.summary());
        out.put("runs", jdbc.queryForList("select * from mf_aggregation_runs order by started_at desc limit 10", Map.of()));
        out.put("cells", jdbc.queryForList("select 'semana' as grain, count(*) filter (where published) as published, "
            + "count(*) filter (where not published) as suppressed from mf_sellout_weekly union all "
            + "select 'dia', count(*) filter (where published), count(*) filter (where not published) from mf_sellout_daily union all "
            + "select 'hora', count(*) filter (where published), count(*) filter (where not published) from mf_sellout_hourly", Map.of()));
        out.put("coverage", jdbc.queryForList("select * from mf_coverage order by level desc, stores desc", Map.of()));
        out.put("pendingBackfill", aggregator.pendingBackfill().size());
        return out;
    }

    /**
     * Recalcula agora. {@code backfill}: refaz o histórico (até 60 semanas) só
     * dos GTINs que entraram na carteira e ainda não foram agregados.
     */
    @PostMapping("/data/rebuild")
    public SellOutAggregator.Result rebuild(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        int weeks = Math.max(1, Math.min(60, b.get("weeks") instanceof Number n ? n.intValue() : 2));
        if (Boolean.TRUE.equals(b.get("backfill"))) {
            List<String> pending = aggregator.pendingBackfill();
            LocalDate thisWeek = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            return aggregator.rebuild(thisWeek.minusWeeks(weeks - 1L), thisWeek.plusWeeks(1), pending, 15);
        }
        return aggregator.rebuildRecent(weeks, 15);
    }

    @PutMapping("/data/locations/{marketId}")
    public Map<String, Object> setLocation(@PathVariable UUID marketId, @RequestBody Map<String, Object> body) {
        return locations.manual(marketId, body);
    }

    @PostMapping("/data/locations/{marketId}/cnpj")
    public Map<String, Object> locationFromCnpj(@PathVariable UUID marketId) {
        return locations.fromCnpj(marketId);
    }

    // ── Cobrança ──────────────────────────────────────────────────────────

    @GetMapping("/billing")
    public Map<String, Object> billingMonth(@RequestParam(required = false) String month) {
        return billing.month(month == null || month.isBlank() ? YearMonth.now() : YearMonth.parse(month));
    }

    @GetMapping("/revenue")
    public Map<String, Object> revenue() {
        return billing.revenue();
    }

    @GetMapping("/invoices")
    public List<Map<String, Object>> invoices(@RequestParam(required = false) UUID industryId) {
        return billing.invoices(industryId);
    }

    @PostMapping("/contracts/{cid}/invoices")
    public Map<String, Object> issue(@PathVariable UUID cid, @RequestBody Map<String, Object> body, Authentication auth) {
        String m = body.get("month") == null ? "" : String.valueOf(body.get("month"));
        return billing.issue(cid, m.isBlank() ? YearMonth.now().minusMonths(1) : YearMonth.parse(m), auth.getName());
    }

    @PostMapping("/invoices/{id}/paid")
    public Map<String, Object> paid(@PathVariable UUID id, Authentication auth) {
        billing.markPaid(id, auth.getName());
        return Map.of("ok", true);
    }

    @PostMapping("/invoices/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable UUID id, Authentication auth) {
        billing.cancel(id, auth.getName());
        return Map.of("ok", true);
    }

    @ExceptionHandler(IndustryAccessService.Denied.class)
    public ResponseEntity<Map<String, Object>> denied(IndustryAccessService.Denied e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", "industry_access", "message", e.getMessage(), "userMessage", e.getMessage()));
    }

    @ExceptionHandler(java.time.format.DateTimeParseException.class)
    public ResponseEntity<Map<String, Object>> badMonth(java.time.format.DateTimeParseException e) {
        return ResponseEntity.badRequest().body(Map.of("error", "bad_request", "message", "Mês inválido (use AAAA-MM).",
            "userMessage", "Mês inválido (use AAAA-MM)."));
    }
}
