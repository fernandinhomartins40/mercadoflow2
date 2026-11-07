package com.pdv2cloud.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.service.art.ArtApiKeyService;
import com.pdv2cloud.service.art.ArtFileStorage;
import com.pdv2cloud.service.art.ArtFormats;
import com.pdv2cloud.service.art.ArtThemeService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * API de temas de encarte para o MCP do Codex (public/mcp/mercadoflow-temas.mjs).
 * Faz o que o criador de temas faz, menos publicar: o tema fica em rascunho
 * até o superadmin conferir e publicar na tela.
 *
 * Sem JWT: a autenticação é a chave da plataforma (Bearer mftema_...), criada
 * pelo superadmin na página de temas.
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/temas-api")
public class ThemeApiController {

    static final int RATE_PER_MINUTE = 120;

    private final ArtApiKeyService keys;
    private final ArtThemeService themes;
    private final ObjectMapper mapper = new ObjectMapper();
    private final Map<UUID, long[]> windows = new ConcurrentHashMap<>();

    public ThemeApiController(ArtApiKeyService keys, ArtThemeService themes) {
        this.keys = keys;
        this.themes = themes;
    }

    @GetMapping("/meta")
    public Map<String, Object> meta(@RequestHeader(name = "Authorization", required = false) String auth) {
        require(auth);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("formats", ArtFormats.ALL.values());
        body.put("occasions", ArtFormats.OCCASIONS);
        body.put("regions", ArtFormats.REGION_KEYS);
        body.put("motionPresets", ArtFormats.MOTION_PRESETS);
        return body;
    }

    @GetMapping("/themes")
    public List<ArtThemeService.Theme> list(@RequestHeader(name = "Authorization", required = false) String auth) {
        require(auth);
        return themes.list(false);
    }

    @PostMapping("/themes")
    public ArtThemeService.Theme create(@RequestHeader(name = "Authorization", required = false) String auth,
                                        @RequestBody Map<String, Object> body) {
        require(auth);
        return themes.create(body);
    }

    @GetMapping("/themes/{id}")
    public ArtThemeService.Theme get(@RequestHeader(name = "Authorization", required = false) String auth, @PathVariable UUID id) {
        require(auth);
        return themes.get(id);
    }

    @PatchMapping("/themes/{id}")
    public ArtThemeService.Theme update(@RequestHeader(name = "Authorization", required = false) String auth,
                                        @PathVariable UUID id, @RequestBody Map<String, Object> body) {
        require(auth);
        if (body.containsKey("status") && !"DRAFT".equals(String.valueOf(body.get("status")).toUpperCase(Locale.ROOT))) {
            throw new IllegalArgumentException("Publicar fica com o superadmin, na página de temas. Pela API o tema fica em rascunho.");
        }
        return themes.update(id, body);
    }

    @PostMapping(value = "/themes/{id}/assets", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ArtFileStorage.Stored uploadAsset(@RequestHeader(name = "Authorization", required = false) String auth,
                                             @PathVariable UUID id, @RequestParam("file") MultipartFile file) {
        require(auth);
        return themes.uploadAsset(id, file);
    }

    @PostMapping(value = "/themes/{id}/seal", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ArtThemeService.Theme uploadSeal(@RequestHeader(name = "Authorization", required = false) String auth,
                                            @PathVariable UUID id, @RequestParam("file") MultipartFile file) {
        require(auth);
        return themes.uploadSeal(id, file);
    }

    /** Camadas de um formato; o servidor monta o fundo achatado. */
    @PutMapping("/themes/{id}/formats/{format}/layers")
    public ArtThemeService.Theme saveLayers(@RequestHeader(name = "Authorization", required = false) String auth,
                                            @PathVariable UUID id, @PathVariable String format, @RequestBody Map<String, Object> body) {
        require(auth);
        try {
            return themes.saveLayers(id, format, null, mapper.writeValueAsString(body.get("layers")));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalArgumentException("Camadas em formato inválido");
        }
    }

    @PutMapping("/themes/{id}/formats/{format}/regions")
    public ArtThemeService.Theme saveRegions(@RequestHeader(name = "Authorization", required = false) String auth,
                                             @PathVariable UUID id, @PathVariable String format, @RequestBody Map<String, Object> body) {
        require(auth);
        return themes.saveRegions(id, format, Map.of("regions", body.getOrDefault("regions", Map.of()), "analysis", Map.of("source", "mcp")));
    }

    private void require(String auth) {
        String secret = auth != null && auth.startsWith("Bearer ") ? auth.substring(7).trim() : null;
        UUID key = keys.resolve(secret)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Chave da API de temas inválida ou revogada"));
        long minute = System.currentTimeMillis() / 60_000;
        long[] w = windows.compute(key, (k, cur) -> cur == null || cur[0] != minute ? new long[] {minute, 1} : new long[] {minute, cur[1] + 1});
        if (w[1] > RATE_PER_MINUTE) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Limite de " + RATE_PER_MINUTE + " chamadas por minuto");
        }
    }
}
