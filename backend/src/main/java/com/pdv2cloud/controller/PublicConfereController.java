package com.pdv2cloud.controller;

import com.pdv2cloud.service.confere.ConfereAdminService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Termos e oferta do Confere, visíveis antes do cadastro. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/public/confere")
public class PublicConfereController {

    private final ConfereAdminService admin;

    public PublicConfereController(ConfereAdminService admin) {
        this.admin = admin;
    }

    @GetMapping("/terms")
    public Map<String, Object> terms() {
        ConfereAdminService.Settings s = TenantContext.runAsSystem(admin::settings);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", s.termsVersion());
        out.put("text", s.termsText());
        out.put("trialReads", s.trialReads());
        out.put("enabled", s.enabled());
        return out;
    }
}
