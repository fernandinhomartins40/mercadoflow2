package com.pdv2cloud.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunDetailsDTO;
import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class CatalogCrawlerRunArtifactsService {

    private static final int MAX_RECORDS_PAGE = 200;
    private static final int MAX_LOG_CHARS = 200_000;
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final ObjectMapper objectMapper;
    private final CatalogImageStorageService catalogImageStorageService;
    private final Path runsDir;
    private final Path catalogDataDir;

    public CatalogCrawlerRunArtifactsService(
        ObjectMapper objectMapper,
        CatalogImageStorageService catalogImageStorageService,
        @Value("${app.catalog.runs-dir:../data/catalog/runs}") String runsDir,
        @Value("${app.catalog.images-dir:../data/catalog/images}") String imagesDir
    ) {
        this.objectMapper = objectMapper;
        this.catalogImageStorageService = catalogImageStorageService;
        this.runsDir = Paths.get(runsDir).toAbsolutePath().normalize();
        Path imagesPath = Paths.get(imagesDir).toAbsolutePath().normalize();
        this.catalogDataDir = imagesPath.getParent() != null ? imagesPath.getParent() : imagesPath;
    }

    public SuperAdminCrawlerRunDetailsDTO buildDetails(SuperAdminCrawlerRunDTO run, int offset, int limit) {
        int safeOffset = Math.max(0, offset);
        int safeLimit = Math.max(1, Math.min(limit, MAX_RECORDS_PAGE));

        SuperAdminCrawlerRunDetailsDTO dto = new SuperAdminCrawlerRunDetailsDTO();
        dto.setRun(run);
        dto.setActive(isActive(run));
        dto.setRecordsOffset(safeOffset);
        dto.setRecordsLimit(safeLimit);

        Path runDir = resolveRunDir(run.getId().toString());
        Path logPath = runDir.resolve("dispatcher.log").normalize();
        Path resultPath = runDir.resolve("result.json").normalize();

        dto.setLogPath(logPath.toString());
        dto.setResultPath(resultPath.toString());
        dto.setLogText(readTail(logPath, MAX_LOG_CHARS));

        Map<String, Object> result = readJsonObject(resultPath);
        List<Map<String, Object>> summary = toObjectList(result.get("summary"));
        dto.setSummary(summary);

        List<RecordSource> recordSources = new ArrayList<>();
        List<Map<String, Object>> manifests = new ArrayList<>();
        int totalRecords = 0;

        for (Map<String, Object> item : summary) {
            String manifestPathRaw = asText(item.get("outputManifest"));
            Path manifestPath = resolveCatalogPath(manifestPathRaw);
            if (manifestPath == null || !Files.isRegularFile(manifestPath)) {
                continue;
            }

            Map<String, Object> manifest = readJsonObject(manifestPath);
            if (manifest.isEmpty()) {
                continue;
            }

            String provider = firstNonBlank(
                asText(item.get("provider")),
                asText(manifest.get("provider")),
                (run.getSources() != null && !run.getSources().isEmpty()) ? run.getSources().get(0) : ""
            );
            String recordsPathRaw = asText(manifest.get("recordsFile"));
            Path recordsPath = resolveCatalogPath(recordsPathRaw);
            if (recordsPath != null) {
                recordSources.add(new RecordSource(provider, recordsPath));
            }

            Map<String, Object> manifestView = new LinkedHashMap<>(manifest);
            manifestView.put("provider", provider);
            manifestView.put("outputManifest", manifestPath.toString());
            if (recordsPath != null) {
                manifestView.put("recordsFile", recordsPath.toString());
            }
            manifests.add(manifestView);
            totalRecords += asInt(manifest.get("count"));
        }

        dto.setManifests(manifests);
        dto.setRecordsTotal(totalRecords);
        dto.setRecords(readRecords(recordSources, safeOffset, safeLimit));
        return dto;
    }

    private List<Map<String, Object>> readRecords(List<RecordSource> sources, int offset, int limit) {
        if (sources.isEmpty()) {
            return new ArrayList<>();
        }

        List<Map<String, Object>> records = new ArrayList<>();
        int skipped = 0;

        for (RecordSource source : sources) {
            if (!Files.isRegularFile(source.recordsPath())) {
                continue;
            }
            try (BufferedReader reader = Files.newBufferedReader(source.recordsPath(), StandardCharsets.UTF_8)) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.isBlank()) {
                        continue;
                    }
                    if (skipped < offset) {
                        skipped++;
                        continue;
                    }
                    if (records.size() >= limit) {
                        return records;
                    }
                    Map<String, Object> record = objectMapper.readValue(line, MAP_TYPE);
                    String resolvedImageUrl = catalogImageStorageService.resolveCatalogImageUrl(
                        asText(record.get("imageUrl")),
                        asText(record.get("imageStorageKey"))
                    );
                    if (!resolvedImageUrl.isBlank()) {
                        record.put("imageUrl", resolvedImageUrl);
                    }
                    if (asText(record.get("provider")).isBlank()) {
                        record.put("provider", source.provider());
                    }
                    records.add(record);
                }
            } catch (Exception ignored) {
            }
        }
        return records;
    }

    private Map<String, Object> readJsonObject(Path path) {
        if (path == null || !Files.isRegularFile(path)) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(path.toFile(), MAP_TYPE);
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private String readTail(Path path, int maxChars) {
        if (path == null || !Files.isRegularFile(path)) {
            return "";
        }
        try {
            String text = Files.readString(path, StandardCharsets.UTF_8);
            if (text.length() <= maxChars) {
                return text;
            }
            return text.substring(text.length() - maxChars);
        } catch (IOException ex) {
            return "";
        }
    }

    private Path resolveRunDir(String runId) {
        Path resolved = runsDir.resolve(runId).normalize();
        if (!resolved.startsWith(runsDir)) {
            return runsDir;
        }
        return resolved;
    }

    private Path resolveCatalogPath(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) {
            return null;
        }
        try {
            Path resolved = Paths.get(rawPath).toAbsolutePath().normalize();
            if (!resolved.startsWith(catalogDataDir)) {
                return null;
            }
            return resolved;
        } catch (Exception ex) {
            return null;
        }
    }

    private List<Map<String, Object>> toObjectList(Object value) {
        if (!(value instanceof List<?> items)) {
            return new ArrayList<>();
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : items) {
            if (item instanceof Map<?, ?> rawMap) {
                Map<String, Object> converted = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                    converted.put(String.valueOf(entry.getKey()), entry.getValue());
                }
                result.add(converted);
            }
        }
        return result;
    }

    private boolean isActive(SuperAdminCrawlerRunDTO run) {
        String status = run != null && run.getStatus() != null ? run.getStatus().trim().toUpperCase(Locale.ROOT) : "";
        return "QUEUED".equals(status) || "RUNNING".equals(status);
    }

    private int asInt(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text) {
            try {
                return Integer.parseInt(text.trim());
            } catch (Exception ignored) {
                return 0;
            }
        }
        return 0;
    }

    private String asText(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private record RecordSource(String provider, Path recordsPath) {
    }
}
