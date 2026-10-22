package com.pdv2cloud.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.service.AuditService;
import com.pdv2cloud.service.account.PersonalDataExportService;
import com.pdv2cloud.service.account.PersonalDataExportService.TooSoonException;
import com.pdv2cloud.tenancy.TenantContext;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * "Baixar meus dados" (LGPD art. 18, II e V), no painel e no Bipaê.
 *
 *  GET /api/v1/me/data-export   arquivo JSON com os dados pessoais da própria pessoa
 *                               (no máximo um a cada 10 minutos; 429 antes disso).
 */
@Profile("!jobs")
@RestController
public class PersonalDataExportController {

    private final PersonalDataExportService exports;
    private final AuditService audit;
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json;

    public PersonalDataExportController(PersonalDataExportService exports, AuditService audit,
                                        NamedParameterJdbcTemplate jdbc, ObjectMapper json) {
        this.exports = exports;
        this.audit = audit;
        this.jdbc = jdbc;
        this.json = json;
    }

    @GetMapping("/api/v1/me/data-export")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'INDUSTRY_USER', 'SELLER_USER')")
    public ResponseEntity<?> export(Authentication auth) throws JsonProcessingException {
        UUID me = TenantContext.runAsSystem(() ->
            jdbc.queryForObject("select id from users where email = :e", Map.of("e", auth.getName()), UUID.class));
        Map<String, Object> data;
        try {
            data = TenantContext.runAsSystem(() -> exports.export(me));
        } catch (TooSoonException e) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(e.retryAfterSeconds()))
                .body(Map.of("error", "data_export_too_soon", "userMessage", e.getMessage()));
        }
        // Só o fato (quem e quando); o conteúdo não vai para a auditoria.
        audit.logAction("USER", me, "PERSONAL_DATA_EXPORT", true, Map.of("userId", me.toString()));
        byte[] body = json.writerWithDefaultPrettyPrinter().writeValueAsBytes(data);
        String file = "meus-dados-mercadoflow-" + LocalDate.now() + ".json";
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_JSON)
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file).build().toString())
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .body(body);
    }
}
