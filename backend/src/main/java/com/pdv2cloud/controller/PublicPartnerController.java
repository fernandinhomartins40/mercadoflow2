package com.pdv2cloud.controller;

import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** ERPs homologados que aceitaram aparecer na lista pública. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/public/partners")
public class PublicPartnerController {

    private final NamedParameterJdbcTemplate jdbc;

    public PublicPartnerController(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return TenantContext.runAsSystem(() -> jdbc.queryForList(
            "select name, website from integration_partners where status = 'HOMOLOGADO' and public_listing order by name", Map.of()));
    }
}
