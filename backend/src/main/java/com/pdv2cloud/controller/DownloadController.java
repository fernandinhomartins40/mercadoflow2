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

@RestController
@RequestMapping("/api/v1/downloads")
public class DownloadController {

    private static final String INSTALLER_FILENAME = "PDV2Cloud-Setup.exe";
    private static final String CHECKSUM_FILENAME = "PDV2Cloud-Setup.exe.sha256";
    private static final String META_FILENAME = "PDV2Cloud-Setup.exe.meta.json";
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneId.systemDefault());

    private final ObjectMapper objectMapper;

    @Value("${app.downloads.installer-dir:/opt/pdv2cloud/installer}")
    private String installerDir;

    public DownloadController(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @GetMapping("/agent-installer")
    public ResponseEntity<Resource> downloadAgentInstaller() {
        try {
            Path installerPath = Paths.get(installerDir, INSTALLER_FILENAME);

            if (!Files.exists(installerPath)) {
                return ResponseEntity.notFound().build();
            }

            Resource resource = new UrlResource(installerPath.toUri());

            if (!resource.exists() || !resource.isReadable()) {
                return ResponseEntity.notFound().build();
            }

            // Get file size
            long fileSize = Files.size(installerPath);

            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + INSTALLER_FILENAME + "\"")
                    .header(HttpHeaders.CONTENT_LENGTH, String.valueOf(fileSize))
                    .header(HttpHeaders.CACHE_CONTROL, "no-cache, no-store, must-revalidate")
                    .header(HttpHeaders.PRAGMA, "no-cache")
                    .header(HttpHeaders.EXPIRES, "0")
                    .body(resource);

        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/agent-installer/info")
    public ResponseEntity<Map<String, Object>> getInstallerInfo() {
        try {
            Path installerPath = Paths.get(installerDir, INSTALLER_FILENAME);
            Path checksumPath = Paths.get(installerDir, CHECKSUM_FILENAME);
            Path metaPath = Paths.get(installerDir, META_FILENAME);

            if (!Files.exists(installerPath)) {
                return ResponseEntity.notFound().build();
            }

            Map<String, Object> info = new HashMap<>();

            // File size
            long fileSize = Files.size(installerPath);
            info.put("filename", INSTALLER_FILENAME);
            info.put("size", fileSize);
            info.put("sizeFormatted", formatFileSize(fileSize));

            // Creation/modification time
            BasicFileAttributes attrs = Files.readAttributes(installerPath, BasicFileAttributes.class);
            Instant modifiedTime = attrs.lastModifiedTime().toInstant();
            info.put("lastModified", DATE_FORMATTER.format(modifiedTime));
            info.put("lastModifiedTimestamp", modifiedTime.toEpochMilli());

            // SHA256 checksum
            if (Files.exists(checksumPath)) {
                String checksum = Files.readString(checksumPath).trim();
                info.put("sha256", checksum);
            }

            // Metadata (optional)
            if (Files.exists(metaPath)) {
                try {
                    JsonNode meta = objectMapper.readTree(Files.readString(metaPath));
                    if (meta.hasNonNull("version")) {
                        info.put("version", meta.get("version").asText());
                    }
                    if (meta.hasNonNull("buildTimestamp")) {
                        info.put("buildTimestamp", meta.get("buildTimestamp").asText());
                    }
                } catch (Exception ignored) {
                    // Metadata is optional; ignore parsing errors to avoid breaking downloads.
                }
            }

            // Download URL
            info.put("downloadUrl", "/api/v1/downloads/agent-installer");

            return ResponseEntity.ok(info);

        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/agent-installer/version")
    public ResponseEntity<Map<String, String>> getInstallerVersion() {
        try {
            Path installerPath = Paths.get(installerDir, INSTALLER_FILENAME);
            Path metaPath = Paths.get(installerDir, META_FILENAME);

            if (!Files.exists(installerPath)) {
                Map<String, String> error = new HashMap<>();
                error.put("error", "Installer not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
            }

            Map<String, String> version = new HashMap<>();
            String resolvedVersion = null;

            if (Files.exists(metaPath)) {
                try {
                    JsonNode meta = objectMapper.readTree(Files.readString(metaPath));
                    if (meta.hasNonNull("version")) {
                        resolvedVersion = meta.get("version").asText();
                    }
                } catch (Exception ignored) {
                    resolvedVersion = null;
                }
            }

            version.put("version", resolvedVersion != null ? resolvedVersion : "unknown");
            version.put("status", "available");

            return ResponseEntity.ok(version);

        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "Failed to get version");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    private String formatFileSize(long size) {
        if (size < 1024) {
            return size + " B";
        } else if (size < 1024 * 1024) {
            return String.format("%.2f KB", size / 1024.0);
        } else if (size < 1024 * 1024 * 1024) {
            return String.format("%.2f MB", size / (1024.0 * 1024.0));
        } else {
            return String.format("%.2f GB", size / (1024.0 * 1024.0 * 1024.0));
        }
    }
}
