package com.pdv2cloud.controller;

import com.pdv2cloud.service.confere.ConfereAdminService;
import com.pdv2cloud.service.confere.ConferePwaService;
import java.net.URI;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
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
    private final ConferePwaService pwa;

    public PublicConfereController(ConfereAdminService admin, ConferePwaService pwa) {
        this.admin = admin;
        this.pwa = pwa;
    }

    /** Manifest do PWA com os ícones configurados e o Content-Type que os navegadores esperam. */
    @GetMapping("/manifest.webmanifest")
    public ResponseEntity<Map<String, Object>> manifest() {
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("application/manifest+json"))
            .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
            .body(TenantContext.runAsSystem(pwa::manifest));
    }

    /** Ícone atual (configurado ou padrão): endereço fixo para o index.html e o app. */
    @GetMapping("/icon/{kind}")
    public ResponseEntity<Void> icon(@PathVariable String kind) {
        String url = TenantContext.runAsSystem(() -> pwa.iconUrl(kind));
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(url))
            .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic()).build();
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
