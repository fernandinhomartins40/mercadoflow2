package com.pdv2cloud.controller;

import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Serve os instaladores do Agente Mercado Flow.
 *
 * Suporta dois instaladores por arquitetura:
 *   AgenteMercadoFlow-Setup.exe      → x64 (padrão)
 *   AgenteMercadoFlow-Setup-x86.exe  → x86 (32-bit / Windows antigos)
 *
 * Enquanto o novo instalador não estiver publicado no diretório de downloads,
 * cai automaticamente para o nome PDV2Cloud-Setup*.exe, de modo que o rename
 * do produto não derrube o download em produção.
 *
 * Parâmetro ?arch=x86 seleciona o instalador 32-bit em todos os endpoints.
 */
@RestController
@RequestMapping("/api/v1/downloads")
public class DownloadController {

    private static final String INSTALLER_FILENAME_X64  = "AgenteMercadoFlow-Setup.exe";
    private static final String INSTALLER_FILENAME_X86  = "AgenteMercadoFlow-Setup-x86.exe";
    private static final String LEGACY_INSTALLER_X64    = "PDV2Cloud-Setup.exe";
    private static final String LEGACY_INSTALLER_X86    = "PDV2Cloud-Setup-x86.exe";
    private static final String CHECKSUM_SUFFIX         = ".sha256";
    private static final String META_SUFFIX             = ".meta.json";

    private static final DateTimeFormatter DATE_FORMATTER =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.systemDefault());

    private final ObjectMapper objectMapper;

    @Value("${app.downloads.installer-dir:/opt/pdv2cloud/installer}")
    private String installerDir;

    public DownloadController(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Nome do instalador para a arquitetura solicitada. Prefere o nome atual e
     * só usa o legado se o arquivo novo ainda não tiver sido publicado.
     */
    private String installerFilename(String arch) {
        boolean x86 = "x86".equalsIgnoreCase(arch);
        String current = x86 ? INSTALLER_FILENAME_X86 : INSTALLER_FILENAME_X64;
        if (Files.exists(Paths.get(installerDir, current))) {
            return current;
        }
        String legacy = x86 ? LEGACY_INSTALLER_X86 : LEGACY_INSTALLER_X64;
        return Files.exists(Paths.get(installerDir, legacy)) ? legacy : current;
    }

    private Path installerPath(String arch) {
        return Paths.get(installerDir, installerFilename(arch));
    }

    private Path checksumPath(String arch) {
        return Paths.get(installerDir, installerFilename(arch) + CHECKSUM_SUFFIX);
    }

    private Path metaPath(String arch) {
        return Paths.get(installerDir, installerFilename(arch) + META_SUFFIX);
    }

    /** Lê o hash SHA-256 do arquivo .sha256 (suporta "hash  filename" e só hash). */
    private String readSha256(Path path) {
        if (!Files.exists(path)) return null;
        try {
            String raw = Files.readString(path).trim();
            String hash = raw.contains(" ") ? raw.split("\\s+")[0] : raw;
            return hash.isBlank() ? null : hash.toLowerCase();
        } catch (IOException e) {
            return null;
        }
    }

    /** Lê o campo "version" do arquivo .meta.json. */
    private String readVersion(Path path) {
        if (!Files.exists(path)) return null;
        try {
            JsonNode meta = objectMapper.readTree(Files.readString(path));
            if (meta.hasNonNull("version")) return meta.get("version").asText();
        } catch (Exception ignored) {}
        return null;
    }

    // ── Endpoints ────────────────────────────────────────────────────────────

    /**
     * GET /api/v1/downloads/agent-installer?arch=x64   → PDV2Cloud-Setup.exe
     * GET /api/v1/downloads/agent-installer?arch=x86   → PDV2Cloud-Setup-x86.exe
     */
    @GetMapping("/agent-installer")
    public ResponseEntity<Resource> downloadAgentInstaller(
            @RequestParam(defaultValue = "x64") String arch) {
        try {
            Path path = installerPath(arch);
            if (!Files.exists(path)) {
                return ResponseEntity.notFound().build();
            }
            Resource resource = new UrlResource(path.toUri());
            if (!resource.isReadable()) {
                return ResponseEntity.notFound().build();
            }
            long fileSize = Files.size(path);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + installerFilename(arch) + "\"")
                    .header(HttpHeaders.CONTENT_LENGTH, String.valueOf(fileSize))
                    .header(HttpHeaders.CACHE_CONTROL, "no-cache, no-store, must-revalidate")
                    .header(HttpHeaders.PRAGMA, "no-cache")
                    .header(HttpHeaders.EXPIRES, "0")
                    .body(resource);
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * GET /api/v1/downloads/agent-installer/version?arch=x64
     * GET /api/v1/downloads/agent-installer/version?arch=x86
     *
     * Resposta:
     * {
     *   "version": "1.0.42",
     *   "arch":    "x64",
     *   "sha256":  "abc123...",
     *   "status":  "available"
     * }
     */
    @GetMapping("/agent-installer/version")
    public ResponseEntity<Map<String, String>> getInstallerVersion(
            @RequestParam(defaultValue = "x64") String arch) {
        try {
            Path path = installerPath(arch);
            if (!Files.exists(path)) {
                Map<String, String> err = new HashMap<>();
                err.put("error", "Installer not found for arch: " + arch);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(err);
            }

            String version = readVersion(metaPath(arch));
            String sha256  = readSha256(checksumPath(arch));

            Map<String, String> resp = new HashMap<>();
            resp.put("version", version != null ? version : "unknown");
            resp.put("arch",    arch);
            resp.put("status",  "available");
            if (sha256 != null) resp.put("sha256", sha256);

            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Failed to get version");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(err);
        }
    }

    /**
     * GET /api/v1/downloads/agent-installer/info?arch=x64
     *
     * Informações completas: tamanho, data, sha256, urls.
     */
    @GetMapping("/agent-installer/info")
    public ResponseEntity<Map<String, Object>> getInstallerInfo(
            @RequestParam(defaultValue = "x64") String arch) {
        try {
            Path path = installerPath(arch);
            if (!Files.exists(path)) {
                return ResponseEntity.notFound().build();
            }

            Map<String, Object> info = new HashMap<>();
            long fileSize = Files.size(path);

            info.put("filename",    installerFilename(arch));
            info.put("arch",        arch);
            info.put("size",        fileSize);
            info.put("sizeFormatted", formatFileSize(fileSize));

            BasicFileAttributes attrs = Files.readAttributes(path, BasicFileAttributes.class);
            Instant modifiedTime = attrs.lastModifiedTime().toInstant();
            info.put("lastModified",          DATE_FORMATTER.format(modifiedTime));
            info.put("lastModifiedTimestamp", modifiedTime.toEpochMilli());

            String sha256  = readSha256(checksumPath(arch));
            String version = readVersion(metaPath(arch));
            if (sha256  != null) info.put("sha256",  sha256);
            if (version != null) info.put("version", version);

            // Meta completo (buildTimestamp etc.)
            Path mPath = metaPath(arch);
            if (Files.exists(mPath)) {
                try {
                    JsonNode meta = objectMapper.readTree(Files.readString(mPath));
                    if (meta.hasNonNull("buildTimestamp")) {
                        info.put("buildTimestamp", meta.get("buildTimestamp").asText());
                    }
                } catch (Exception ignored) {}
            }

            info.put("downloadUrl", "/api/v1/downloads/agent-installer?arch=" + arch);
            return ResponseEntity.ok(info);

        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * GET /api/v1/downloads/agent-installer/available
     *
     * Lista quais arquiteturas estão disponíveis no servidor.
     * Útil para o frontend mostrar links de download corretos.
     *
     * Resposta:
     * {
     *   "x64": { "version": "1.0.42", "sha256": "...", "available": true },
     *   "x86": { "version": "1.0.42", "sha256": "...", "available": true }
     * }
     */
    @GetMapping("/agent-installer/available")
    public ResponseEntity<Map<String, Object>> getAvailableInstallers() {
        Map<String, Object> result = new HashMap<>();
        for (String arch : new String[]{"x64", "x86"}) {
            Path path = installerPath(arch);
            Map<String, Object> entry = new HashMap<>();
            boolean exists = Files.exists(path);
            entry.put("available", exists);
            if (exists) {
                String version = readVersion(metaPath(arch));
                String sha256  = readSha256(checksumPath(arch));
                if (version != null) entry.put("version", version);
                if (sha256  != null) entry.put("sha256",  sha256);
                entry.put("downloadUrl", "/api/v1/downloads/agent-installer?arch=" + arch);
            }
            result.put(arch, entry);
        }
        return ResponseEntity.ok(result);
    }

    // ── Utilitário ────────────────────────────────────────────────────────────

    private String formatFileSize(long size) {
        if (size < 1024)            return size + " B";
        if (size < 1024 * 1024)     return String.format("%.2f KB", size / 1024.0);
        if (size < 1024L * 1024 * 1024) return String.format("%.2f MB", size / (1024.0 * 1024));
        return String.format("%.2f GB", size / (1024.0 * 1024 * 1024));
    }
}
