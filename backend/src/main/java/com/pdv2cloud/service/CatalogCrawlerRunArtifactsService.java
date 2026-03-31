package com.pdv2cloud.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.SuperAdminCrawlerCheckpointDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunDetailsDTO;
import com.pdv2cloud.model.entity.CatalogCrawlerCheckpoint;
import com.pdv2cloud.repository.CatalogCrawlerCheckpointRepository;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class CatalogCrawlerRunArtifactsService {

    private static final int MAX_RECORDS_PAGE = 200;
    private static final int MAX_LOG_CHARS = 200_000;
    private static final int MAX_ERROR_HIGHLIGHTS = 18;
    private static final int MAX_RECENT_CHECKPOINTS = 20;
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final ObjectMapper objectMapper;
    private final CatalogImageStorageService catalogImageStorageService;
    private final CatalogCrawlerCheckpointRepository crawlerCheckpointRepository;
    private final Path runsDir;
    private final Path catalogDataDir;

    public CatalogCrawlerRunArtifactsService(
        ObjectMapper objectMapper,
        CatalogImageStorageService catalogImageStorageService,
        CatalogCrawlerCheckpointRepository crawlerCheckpointRepository,
        @Value("${app.catalog.runs-dir:../data/catalog/runs}") String runsDir,
        @Value("${app.catalog.images-dir:../data/catalog/images}") String imagesDir
    ) {
        this.objectMapper = objectMapper;
        this.catalogImageStorageService = catalogImageStorageService;
        this.crawlerCheckpointRepository = crawlerCheckpointRepository;
        this.runsDir = Paths.get(runsDir).toAbsolutePath().normalize();
        Path imagesPath = Paths.get(imagesDir).toAbsolutePath().normalize();
        this.catalogDataDir = imagesPath.getParent() != null ? imagesPath.getParent() : imagesPath;
    }

    public SuperAdminCrawlerRunDetailsDTO buildDetails(SuperAdminCrawlerRunDTO run, int offset, int limit) {
        int safeOffset = Math.max(0, offset);
        int safeLimit = Math.max(1, Math.min(limit, MAX_RECORDS_PAGE));

        Path runDir = resolveRunDir(run.getId().toString());
        Path logPath = runDir.resolve("dispatcher.log").normalize();
        Path resultPath = runDir.resolve("result.json").normalize();
        Path progressPath = runDir.resolve("progress.json").normalize();

        Map<String, Object> progress = readJsonObject(progressPath);
        mergeRunWithProgress(run, progress);
        LogSnapshot logSnapshot = readLogSnapshot(logPath, MAX_LOG_CHARS, MAX_ERROR_HIGHLIGHTS);

        SuperAdminCrawlerRunDetailsDTO dto = new SuperAdminCrawlerRunDetailsDTO();
        dto.setRun(run);
        dto.setActive(isActive(run));
        dto.setRecordsOffset(safeOffset);
        dto.setRecordsLimit(safeLimit);

        dto.setLogPath(logPath.toString());
        dto.setResultPath(resultPath.toString());
        dto.setProgressPath(progressPath.toString());
        dto.setLogText(logSnapshot.tailText());
        dto.setLogUpdatedAt(logSnapshot.updatedAt());
        dto.setLogSizeBytes(logSnapshot.sizeBytes());
        dto.setErrorHighlights(logSnapshot.errorHighlights());
        dto.setHeartbeatAt(firstNonBlank(asText(progress.get("updatedAt")), logSnapshot.updatedAt()));
        dto.setLiveProgress(progress.isEmpty() ? new LinkedHashMap<>() : new LinkedHashMap<>(progress));
        dto.setDurationSeconds(computeDurationSeconds(run));
        dto.setCapturedPerMinute(computePerMinute(run.getScannedProducts(), dto.getDurationSeconds()));
        dto.setImportedPerMinute(computePerMinute(run.getImportedProducts(), dto.getDurationSeconds()));

        Map<String, Object> result = readJsonObject(resultPath);
        List<Map<String, Object>> summary = toObjectList(result.get("summary"));
        String provider = firstNonBlank(
            (run.getSources() != null && !run.getSources().isEmpty()) ? run.getSources().get(0) : "",
            asText(progress.get("provider"))
        );
        if (summary.isEmpty() && !progress.isEmpty()) {
            Map<String, Object> liveSummary = new LinkedHashMap<>();
            liveSummary.put("provider", provider);
            liveSummary.put("source", firstNonBlank(asText(progress.get("stage")), "LIVE_PROGRESS"));
            liveSummary.put("capturedProducts", asInt(progress.get("capturedProducts")));
            liveSummary.put("importedProducts", asInt(progress.get("importedProducts")));
            liveSummary.put("pendingCount", asInt(progress.get("pendingCount")));
            liveSummary.put("imagesSaved", asInt(progress.get("imagesSaved")));
            liveSummary.put("recordsFile", asText(progress.get("recordsFile")));
            liveSummary.put("outputManifest", asText(progress.get("manifestFile")));
            liveSummary.put("updatedAt", asText(progress.get("updatedAt")));
            summary = new ArrayList<>(Collections.singletonList(liveSummary));
        }
        dto.setSummary(summary);

        Map<String, RecordSource> recordSources = new LinkedHashMap<>();
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
                addRecordSource(recordSources, provider, recordsPath);
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

        if (manifests.isEmpty() && !progress.isEmpty()) {
            Map<String, Object> liveManifest = new LinkedHashMap<>();
            liveManifest.put("provider", provider);
            liveManifest.put("source", firstNonBlank(asText(progress.get("stage")), "LIVE_PROGRESS"));
            liveManifest.put("count", asInt(progress.get("capturedProducts")));
            liveManifest.put("capturedProducts", asInt(progress.get("capturedProducts")));
            liveManifest.put("importedProducts", asInt(progress.get("importedProducts")));
            liveManifest.put("imagesSaved", asInt(progress.get("imagesSaved")));
            liveManifest.put("pendingCount", asInt(progress.get("pendingCount")));
            liveManifest.put("recordsFile", asText(progress.get("recordsFile")));
            liveManifest.put("outputManifest", asText(progress.get("manifestFile")));
            liveManifest.put("updatedAt", asText(progress.get("updatedAt")));
            manifests.add(liveManifest);
        }

        Path liveRecordsPath = resolveCatalogPath(asText(progress.get("recordsFile")));
        if (liveRecordsPath != null) {
            addRecordSource(recordSources, provider, liveRecordsPath);
        }

        dto.setManifests(manifests);
        dto.setRecordsTotal(Math.max(totalRecords, asInt(progress.get("capturedProducts"))));
        dto.setRecords(readRecords(new ArrayList<>(recordSources.values()), safeOffset, safeLimit));
        populateCheckpointDetails(dto, provider, run.getId());
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

    private Map<String, Object> parseJsonObject(String rawJson) {
        if (rawJson == null || rawJson.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(rawJson, MAP_TYPE);
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private LogSnapshot readLogSnapshot(Path path, int maxChars, int maxHighlights) {
        if (path == null || !Files.isRegularFile(path)) {
            return new LogSnapshot("", "", 0L, new ArrayList<>());
        }
        try {
            long size = Files.size(path);
            int bytesToRead = (int) Math.min(Math.max(4_096, maxChars * 4L), size);
            byte[] buffer = new byte[bytesToRead];
            try (RandomAccessFile file = new RandomAccessFile(path.toFile(), "r")) {
                file.seek(Math.max(0L, size - bytesToRead));
                file.readFully(buffer);
            }
            String text = new String(buffer, StandardCharsets.UTF_8);
            if (text.length() <= maxChars) {
                return new LogSnapshot(text, lastModifiedAt(path), size, extractErrorHighlights(text, maxHighlights));
            }
            String tail = text.substring(text.length() - maxChars);
            return new LogSnapshot(tail, lastModifiedAt(path), size, extractErrorHighlights(tail, maxHighlights));
        } catch (IOException ex) {
            return new LogSnapshot("", "", 0L, new ArrayList<>());
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

    private void addRecordSource(Map<String, RecordSource> sources, String provider, Path recordsPath) {
        if (recordsPath == null) {
            return;
        }
        sources.putIfAbsent(recordsPath.toString(), new RecordSource(provider, recordsPath));
    }

    private void mergeRunWithProgress(SuperAdminCrawlerRunDTO run, Map<String, Object> progress) {
        if (run == null || progress.isEmpty()) {
            return;
        }
        int capturedProducts = asInt(progress.get("capturedProducts"));
        int scannedProducts = Math.max(capturedProducts, asInt(progress.get("scannedProducts")));
        int importedProducts = asInt(progress.get("importedProducts"));
        int skippedInvalidGtin = asInt(progress.get("skippedInvalidGtin"));
        int skippedMissingName = asInt(progress.get("skippedMissingName"));
        int skippedMedication = asInt(progress.get("skippedMedication"));
        int skippedDuplicateGtin = asInt(progress.get("skippedDuplicateGtin"));
        int errors = asInt(progress.get("errors"));

        run.setScannedProducts(Math.max(safeInt(run.getScannedProducts()), scannedProducts));
        run.setImportedProducts(Math.max(safeInt(run.getImportedProducts()), importedProducts));
        run.setSkippedInvalidGtin(Math.max(safeInt(run.getSkippedInvalidGtin()), skippedInvalidGtin));
        run.setSkippedMissingName(Math.max(safeInt(run.getSkippedMissingName()), skippedMissingName));
        run.setSkippedMedication(Math.max(safeInt(run.getSkippedMedication()), skippedMedication));
        run.setSkippedDuplicateGtin(Math.max(safeInt(run.getSkippedDuplicateGtin()), skippedDuplicateGtin));
        run.setErrors(Math.max(safeInt(run.getErrors()), errors));

        String progressStatus = asText(progress.get("status"));
        if (!progressStatus.isBlank() && isActive(run)) {
            run.setStatus(progressStatus);
        }
        String progressMessage = firstNonBlank(asText(progress.get("message")), buildProgressMessage(progress));
        if (!progressMessage.isBlank() && (isActive(run) || asText(run.getMessage()).isBlank())) {
            run.setMessage(progressMessage);
        }
        String provider = asText(progress.get("provider"));
        if (!provider.isBlank() && (run.getSources() == null || run.getSources().isEmpty())) {
            run.setSources(new ArrayList<>(Collections.singletonList(provider)));
        }
    }

    private String buildProgressMessage(Map<String, Object> progress) {
        String stage = firstNonBlank(asText(progress.get("stage")), "RUNNING");
        int captured = asInt(progress.get("capturedProducts"));
        int imported = asInt(progress.get("importedProducts"));
        int pending = asInt(progress.get("pendingCount"));
        int errors = asInt(progress.get("errors"));
        return "Ao vivo: etapa=" + stage + " capturados=" + captured + " importados=" + imported + " pendentes=" + pending + " erros=" + errors;
    }

    private void populateCheckpointDetails(SuperAdminCrawlerRunDetailsDTO dto, String provider, UUID runId) {
        if (dto == null || provider == null || provider.isBlank() || runId == null) {
            return;
        }
        Map<String, Integer> statusCounts = new LinkedHashMap<>();
        for (String status : List.of("COMPLETED", "FAILED", "RUNNING", "DISCOVERED")) {
            long count = crawlerCheckpointRepository.countByProviderAndRunIdAndStatus(provider, runId, status);
            if (count > 0) {
                statusCounts.put(status, (int) Math.min(Integer.MAX_VALUE, count));
            }
        }
        dto.setCheckpointStatusCounts(statusCounts);
        dto.setRecentCheckpoints(
            crawlerCheckpointRepository.findTop50ByProviderAndRunIdOrderByUpdatedAtDesc(provider, runId).stream()
                .limit(MAX_RECENT_CHECKPOINTS)
                .map(this::toCheckpointDTO)
                .toList()
        );
        dto.setRecentFailedCheckpoints(
            crawlerCheckpointRepository.findTop25ByProviderAndRunIdAndStatusOrderByUpdatedAtDesc(provider, runId, "FAILED").stream()
                .map(this::toCheckpointDTO)
                .toList()
        );

        String status = asText(dto.getRun() != null ? dto.getRun().getStatus() : "");
        boolean canResume = ("FAILED".equalsIgnoreCase(status) || "CANCELLED".equalsIgnoreCase(status))
            && dto.getRun() != null
            && dto.getRun().getSources() != null
            && dto.getRun().getSources().size() == 1
            && (
                statusCounts.getOrDefault("COMPLETED", 0) > 0
                    || safeInt(dto.getRun().getImportedProducts()) > 0
                    || safeInt(dto.getRun().getScannedProducts()) > 0
                    || safeInt(dto.getRecordsTotal()) > 0
            );
        dto.setCanResumeFromCheckpoint(canResume);
        if (canResume) {
            dto.setContinueHint("A retomada cria um novo run e reaproveita os checkpoints completos para continuar de onde parou.");
        }
    }

    private SuperAdminCrawlerCheckpointDTO toCheckpointDTO(CatalogCrawlerCheckpoint checkpoint) {
        SuperAdminCrawlerCheckpointDTO dto = new SuperAdminCrawlerCheckpointDTO();
        dto.setId(checkpoint.getId());
        dto.setProvider(checkpoint.getProvider());
        dto.setScopeType(checkpoint.getScopeType());
        dto.setScopeKey(checkpoint.getScopeKey());
        dto.setScopeHash(checkpoint.getScopeHash());
        dto.setStatus(checkpoint.getStatus());
        dto.setRunId(checkpoint.getRunId());
        dto.setItemCount(checkpoint.getItemCount());
        dto.setMetadata(parseJsonObject(checkpoint.getMetadataJson()));
        dto.setErrorMessage(checkpoint.getErrorMessage());
        dto.setCompletedAt(checkpoint.getCompletedAt());
        dto.setLastSeenAt(checkpoint.getLastSeenAt());
        dto.setUpdatedAt(checkpoint.getUpdatedAt());
        return dto;
    }

    private double computeDurationSeconds(SuperAdminCrawlerRunDTO run) {
        if (run == null) {
            return 0.0;
        }
        LocalDateTime start = run.getStartedAt() != null ? run.getStartedAt() : run.getRequestedAt();
        LocalDateTime end = run.getFinishedAt() != null ? run.getFinishedAt() : LocalDateTime.now();
        if (start == null || end == null || end.isBefore(start)) {
            return 0.0;
        }
        return Math.max(0.0, Duration.between(start, end).toMillis() / 1000.0);
    }

    private double computePerMinute(Integer count, Double durationSeconds) {
        double seconds = durationSeconds == null ? 0.0 : durationSeconds;
        if (seconds <= 0.0) {
            return 0.0;
        }
        return (safeInt(count) * 60.0) / seconds;
    }

    private List<String> extractErrorHighlights(String logText, int maxHighlights) {
        if (logText == null || logText.isBlank()) {
            return new ArrayList<>();
        }
        LinkedHashSet<String> matches = new LinkedHashSet<>();
        String[] lines = logText.split("\\R");
        for (String rawLine : lines) {
            String line = rawLine == null ? "" : rawLine.trim();
            String normalized = line.toLowerCase(Locale.ROOT);
            if (line.isBlank()) {
                continue;
            }
            if (
                normalized.contains("error")
                    || normalized.contains("failed")
                    || normalized.contains("exception")
                    || normalized.contains("traceback")
                    || normalized.contains("cancel")
            ) {
                matches.add(line);
            }
        }
        List<String> highlights = new ArrayList<>(matches);
        if (highlights.size() <= maxHighlights) {
            return highlights;
        }
        return new ArrayList<>(highlights.subList(highlights.size() - maxHighlights, highlights.size()));
    }

    private String lastModifiedAt(Path path) {
        try {
            return Files.getLastModifiedTime(path).toInstant().toString();
        } catch (IOException ex) {
            return "";
        }
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

    private int safeInt(Integer value) {
        return value == null ? 0 : value;
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

    private record LogSnapshot(String tailText, String updatedAt, long sizeBytes, List<String> errorHighlights) {
    }

    private record RecordSource(String provider, Path recordsPath) {
    }
}
