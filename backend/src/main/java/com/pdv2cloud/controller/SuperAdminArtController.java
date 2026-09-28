package com.pdv2cloud.controller;

import com.pdv2cloud.service.ai.LlmClient.LlmResponse;
import com.pdv2cloud.service.art.ArtFormats;
import com.pdv2cloud.service.art.ArtThemeService;
import com.pdv2cloud.service.art.PlatformAiService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Criador de temas de encarte e chave de IA da plataforma. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/super-admin/art")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SuperAdminArtController {

    private final ArtThemeService themes;
    private final PlatformAiService ai;

    public SuperAdminArtController(ArtThemeService themes, PlatformAiService ai) {
        this.themes = themes;
        this.ai = ai;
    }

    @GetMapping("/meta")
    public Map<String, Object> meta() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("formats", ArtFormats.ALL.values());
        body.put("occasions", ArtFormats.OCCASIONS);
        return body;
    }

    // ── Chave de IA ────────────────────────────────────────────────────────

    @GetMapping("/ai-settings")
    public PlatformAiService.Settings aiSettings() {
        return ai.get();
    }

    @PutMapping("/ai-settings")
    public PlatformAiService.Settings saveAiSettings(@RequestBody Map<String, Object> body, Authentication auth) {
        return ai.save(
            body.get("apiKey") == null ? null : String.valueOf(body.get("apiKey")),
            body.get("model") == null ? null : String.valueOf(body.get("model")),
            auth == null ? null : auth.getName());
    }

    @DeleteMapping("/ai-settings/key")
    public PlatformAiService.Settings removeKey(Authentication auth) {
        return ai.removeKey(auth == null ? null : auth.getName());
    }

    @PostMapping("/ai-settings/test")
    public Map<String, Object> testAi() {
        LlmResponse r = ai.test();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", r.success());
        body.put("latencyMs", r.latencyMs());
        body.put("message", r.success() ? "Chave válida: o DeepSeek respondeu." : r.errorMessage());
        return body;
    }

    // ── Temas ──────────────────────────────────────────────────────────────

    @GetMapping("/themes")
    public List<ArtThemeService.Theme> list() {
        return themes.list(false);
    }

    @PostMapping("/themes")
    public ArtThemeService.Theme create(@RequestBody Map<String, Object> body) {
        return themes.create(body);
    }

    @GetMapping("/themes/{id}")
    public ArtThemeService.Theme get(@PathVariable UUID id) {
        return themes.get(id);
    }

    @PatchMapping("/themes/{id}")
    public ArtThemeService.Theme update(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return themes.update(id, body);
    }

    @DeleteMapping("/themes/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        themes.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(value = "/themes/{id}/seal", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ArtThemeService.Theme uploadSeal(@PathVariable UUID id, @RequestParam("file") MultipartFile file) {
        return themes.uploadSeal(id, file);
    }

    @DeleteMapping("/themes/{id}/seal")
    public ArtThemeService.Theme removeSeal(@PathVariable UUID id) {
        return themes.removeSeal(id);
    }

    @PostMapping(value = "/themes/{id}/formats/{format}/background", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ArtThemeService.Theme uploadBackground(
        @PathVariable UUID id, @PathVariable String format, @RequestParam("file") MultipartFile file) {
        return themes.uploadBackground(id, format, file);
    }

    @PutMapping("/themes/{id}/formats/{format}/regions")
    public ArtThemeService.Theme saveRegions(
        @PathVariable UUID id, @PathVariable String format, @RequestBody Map<String, Object> body) {
        return themes.saveRegions(id, format, body);
    }

    @DeleteMapping("/themes/{id}/formats/{format}")
    public ArtThemeService.Theme deleteFormat(@PathVariable UUID id, @PathVariable String format) {
        return themes.deleteFormat(id, format);
    }

    @PostMapping("/themes/{id}/suggest")
    public ArtThemeService.Suggestion suggest(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return themes.suggest(id, body);
    }
}
