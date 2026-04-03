package com.pdv2cloud.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.CatalogImportRecordDTO;
import com.pdv2cloud.model.dto.CatalogImportSourceResultDTO;
import com.pdv2cloud.model.dto.CatalogRecordsImportRequestDTO;
import com.pdv2cloud.model.dto.CatalogWebImportResponseDTO;
import com.pdv2cloud.model.dto.ProductEnrichmentUpsertRequest;
import com.pdv2cloud.util.ProductCatalogUtils;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
@Slf4j
public class WebCatalogImportService {

    private static final int MIN_PAGE_SIZE = 10;
    private static final int MAX_PAGE_SIZE = 100;
    private static final int MIN_PAGES = 1;
    private static final int MAX_PAGES = 300;
    private static final String COUNTRIES_TAG = "brasil";
    private static final String SOURCE_LICENSE = "Open Food Facts (ODbL)";
    private static final BigDecimal DEFAULT_CONFIDENCE = BigDecimal.valueOf(0.88);
    private static final Set<String> MEDICATION_KEYWORDS = Set.of(
        "medicamento",
        "remedio",
        "farmaco",
        "antibiotico",
        "antiinflamatorio",
        "analgesico",
        "comprimido",
        "capsula",
        "xarope",
        "prescricao",
        "tarja preta",
        "tarja vermelha",
        "rx"
    );

    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(15))
        .build();

    @Autowired
    private ProductCatalogService productCatalogService;

    @Autowired
    private ObjectMapper objectMapper;

    public CatalogWebImportResponseDTO importFromPublicSources(
        int maxPagesPerSource,
        int pageSize
    ) {
        int safePageSize = clamp(pageSize, MIN_PAGE_SIZE, MAX_PAGE_SIZE);
        int safeMaxPages = clamp(maxPagesPerSource, MIN_PAGES, MAX_PAGES);
        LocalDateTime startedAt = LocalDateTime.now();

        List<SourceSpec> sources = new ArrayList<>();
        // Open Facts sources are intentionally excluded from the import pipeline.

        Set<String> importedGtins = new HashSet<>();
        List<CatalogImportSourceResultDTO> results = new ArrayList<>();

        int totalScanned = 0;
        int totalImported = 0;
        int totalInvalidGtin = 0;
        int totalMissingName = 0;
        int totalMedication = 0;
        int totalDuplicate = 0;
        int totalErrors = 0;

        for (SourceSpec source : sources) {
            CatalogImportSourceResultDTO result = importSource(source, safeMaxPages, safePageSize, importedGtins);
            results.add(result);

            totalScanned += result.getScannedProducts();
            totalImported += result.getImportedProducts();
            totalInvalidGtin += result.getSkippedInvalidGtin();
            totalMissingName += result.getSkippedMissingName();
            totalMedication += result.getSkippedMedication();
            totalDuplicate += result.getSkippedDuplicateGtin();
            totalErrors += result.getErrors();
        }

        return new CatalogWebImportResponseDTO(
            startedAt,
            LocalDateTime.now(),
            safeMaxPages,
            safePageSize,
            totalScanned,
            totalImported,
            totalInvalidGtin,
            totalMissingName,
            totalMedication,
            totalDuplicate,
            totalErrors,
            results
        );
    }

    public CatalogWebImportResponseDTO importFromRecords(CatalogRecordsImportRequestDTO request) {
        LocalDateTime startedAt = LocalDateTime.now();
        String provider = normalizeProvider(request.getProvider());
        String sourceLicense = normalizeSourceLicense(request.getSourceLicense());

        int scannedProducts = 0;
        int importedProducts = 0;
        int skippedInvalidGtin = 0;
        int skippedMissingName = 0;
        int skippedMedication = 0;
        int skippedDuplicateGtin = 0;
        int errors = 0;

        Set<String> importedGtins = new HashSet<>();

        for (CatalogImportRecordDTO item : request.getItems()) {
            scannedProducts++;
            ProductEnrichmentUpsertRequest mapped = mapRecordToRequest(
                provider,
                sourceLicense,
                request,
                item
            );
            if (mapped == null) {
                skippedInvalidGtin++;
                continue;
            }
            if (mapped.getCanonicalName() == null || mapped.getCanonicalName().isBlank()) {
                skippedMissingName++;
                continue;
            }
            if (request.isSkipMedication() && isMedication(mapped)) {
                skippedMedication++;
                continue;
            }
            if (!importedGtins.add(mapped.getGtin())) {
                skippedDuplicateGtin++;
                continue;
            }

            try {
                productCatalogService.upsertEnrichment(mapped);
                importedProducts++;
            } catch (Exception ex) {
                errors++;
                log.warn(
                    "Failed to import catalog record | provider={} gtin={} error={}",
                    provider,
                    mapped.getGtin(),
                    ex.getMessage()
                );
            }
        }

        CatalogImportSourceResultDTO sourceResult = new CatalogImportSourceResultDTO(
            provider,
            "INLINE_PAYLOAD",
            1,
            1,
            scannedProducts,
            importedProducts,
            skippedInvalidGtin,
            skippedMissingName,
            skippedMedication,
            skippedDuplicateGtin,
            errors
        );

        return new CatalogWebImportResponseDTO(
            startedAt,
            LocalDateTime.now(),
            1,
            request.getItems().size(),
            scannedProducts,
            importedProducts,
            skippedInvalidGtin,
            skippedMissingName,
            skippedMedication,
            skippedDuplicateGtin,
            errors,
            List.of(sourceResult)
        );
    }

    private CatalogImportSourceResultDTO importSource(
        SourceSpec source,
        int maxPages,
        int pageSize,
        Set<String> importedGtins
    ) {
        int fetchedPages = 0;
        int scannedProducts = 0;
        int importedProducts = 0;
        int skippedInvalidGtin = 0;
        int skippedMissingName = 0;
        int skippedMedication = 0;
        int skippedDuplicateGtin = 0;
        int errors = 0;

        for (int page = 1; page <= maxPages; page++) {
            JsonNode response = fetchSourcePage(source.baseUrl(), page, pageSize);
            if (response == null) {
                errors++;
                break;
            }

            JsonNode productsNode = response.path("products");
            if (!productsNode.isArray() || productsNode.isEmpty()) {
                break;
            }

            fetchedPages++;
            for (JsonNode productNode : productsNode) {
                scannedProducts++;
                ProductEnrichmentUpsertRequest request = mapNodeToRequest(source.provider(), productNode);
                if (request == null) {
                    skippedInvalidGtin++;
                    continue;
                }

                if (request.getCanonicalName() == null || request.getCanonicalName().isBlank()) {
                    skippedMissingName++;
                    continue;
                }
                if (isMedication(request)) {
                    skippedMedication++;
                    continue;
                }
                if (!importedGtins.add(request.getGtin())) {
                    skippedDuplicateGtin++;
                    continue;
                }

                try {
                    productCatalogService.upsertEnrichment(request);
                    importedProducts++;
                } catch (Exception ex) {
                    errors++;
                    log.warn(
                        "Failed to import product from {} | gtin={} | error={}",
                        source.provider(),
                        request.getGtin(),
                        ex.getMessage()
                    );
                }
            }

            int pageCount = response.path("page_count").asInt(0);
            if (pageCount > 0 && page >= pageCount) {
                break;
            }
        }

        return new CatalogImportSourceResultDTO(
            source.provider(),
            source.baseUrl(),
            maxPages,
            fetchedPages,
            scannedProducts,
            importedProducts,
            skippedInvalidGtin,
            skippedMissingName,
            skippedMedication,
            skippedDuplicateGtin,
            errors
        );
    }

    private JsonNode fetchSourcePage(String baseUrl, int page, int pageSize) {
        String fields = "code,product_name,product_name_pt,generic_name,generic_name_pt,brands,categories,categories_tags,labels,quantity";
        fields += ",image_url,image_front_url,manufacturing_places,nutriments";
        String query = "countries_tags=" + encode(COUNTRIES_TAG) +
            "&page=" + page +
            "&page_size=" + pageSize +
            "&fields=" + encode(fields);
        URI uri = URI.create(baseUrl + "/api/v2/search?" + query);

        for (int attempt = 1; attempt <= 2; attempt++) {
            try {
                HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(120))
                    .header("User-Agent", "MercadoFlow Catalog Importer (+https://mercadoflow.com)")
                    .GET()
                    .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() >= 200 && response.statusCode() < 300) {
                    return objectMapper.readTree(response.body());
                }
                log.warn(
                    "Catalog source request failed | status={} url={} attempt={}",
                    response.statusCode(),
                    uri,
                    attempt
                );
            } catch (Exception ex) {
                log.warn(
                    "Catalog source request failed | baseUrl={} page={} attempt={} error={}",
                    baseUrl,
                    page,
                    attempt,
                    ex.getMessage()
                );
            }

            if (attempt < 2) {
                try {
                    Thread.sleep(1500L);
                } catch (InterruptedException interruptedException) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        return null;
    }

    private ProductEnrichmentUpsertRequest mapNodeToRequest(String provider, JsonNode node) {
        String gtin = ProductCatalogUtils.normalizeGtin(readText(node, "code"));
        if (gtin == null) {
            return null;
        }

        String canonicalName = firstNonBlank(
            readText(node, "product_name_pt"),
            readText(node, "product_name"),
            readText(node, "generic_name_pt"),
            readText(node, "generic_name")
        );

        ProductEnrichmentUpsertRequest request = new ProductEnrichmentUpsertRequest();
        request.setGtin(gtin);
        request.setProvider(provider);
        request.setProviderProductId(gtin);
        request.setCanonicalName(canonicalName);
        request.setBrand(normalizeBrand(readText(node, "brands")));
        request.setCategory(resolveCategory(node));
        request.setManufacturer(readText(node, "manufacturing_places"));
        request.setPackageDescription(readText(node, "quantity"));
        request.setDescription(firstNonBlank(readText(node, "generic_name_pt"), readText(node, "generic_name")));
        request.setImageUrl(firstNonBlank(readText(node, "image_front_url"), readText(node, "image_url")));
        request.setSourceLicense(SOURCE_LICENSE);
        request.setConfidenceScore(DEFAULT_CONFIDENCE);
        request.setRawPayload(node.toString());
        return request;
    }

    private ProductEnrichmentUpsertRequest mapRecordToRequest(
        String provider,
        String sourceLicense,
        CatalogRecordsImportRequestDTO request,
        CatalogImportRecordDTO record
    ) {
        String gtin = ProductCatalogUtils.normalizeGtin(record.getCode());
        if (gtin == null) {
            return null;
        }

        ProductEnrichmentUpsertRequest mapped = new ProductEnrichmentUpsertRequest();
        mapped.setGtin(gtin);
        mapped.setProvider(provider);
        mapped.setProviderProductId(ProductCatalogUtils.canonicalizeDisplayName(record.getCode()));
        mapped.setCanonicalName(ProductCatalogUtils.canonicalizeDisplayName(record.getName()));
        mapped.setBrand(ProductCatalogUtils.canonicalizeDisplayName(record.getBrand()));
        mapped.setCategory(ProductCatalogUtils.canonicalizeDisplayName(record.getCategory()));
        mapped.setNcm(ProductCatalogUtils.canonicalizeDisplayName(record.getNcm()));
        mapped.setUnit(ProductCatalogUtils.canonicalizeDisplayName(record.getUnit()));
        mapped.setDescription(ProductCatalogUtils.canonicalizeDisplayName(record.getDescription()));
        mapped.setManufacturer(ProductCatalogUtils.canonicalizeDisplayName(record.getManufacturer()));
        mapped.setPackageDescription(ProductCatalogUtils.canonicalizeDisplayName(record.getPackageDescription()));
        mapped.setImageUrl(ProductCatalogUtils.canonicalizeDisplayName(record.getImageUrl()));
        mapped.setImageStorageKey(ProductCatalogUtils.canonicalizeDisplayName(record.getImageStorageKey()));
        mapped.setAttributesJson(record.getAttributesJson());
        mapped.setSourceLicense(sourceLicense);
        mapped.setConfidenceScore(scaleConfidence(request.getConfidenceScore()));
        mapped.setRawPayload(resolveRawPayload(record));
        return mapped;
    }

    private boolean isMedication(ProductEnrichmentUpsertRequest request) {
        String combined = String.join(
            " ",
            defaultText(request.getCanonicalName()),
            defaultText(request.getCategory()),
            defaultText(request.getBrand()),
            defaultText(request.getPackageDescription())
        );
        String normalized = ProductCatalogUtils.normalizeName(combined);
        if (normalized.isBlank()) {
            return false;
        }
        for (String keyword : MEDICATION_KEYWORDS) {
            String normalizedKeyword = ProductCatalogUtils.normalizeName(keyword);
            if (normalized.contains(normalizedKeyword)) {
                return true;
            }
        }
        return false;
    }

    private String resolveCategory(JsonNode node) {
        String direct = readText(node, "categories");
        if (direct != null && !direct.isBlank()) {
            return direct;
        }
        JsonNode tags = node.path("categories_tags");
        if (!tags.isArray() || tags.isEmpty()) {
            return null;
        }

        List<String> values = new ArrayList<>();
        int limit = Math.min(tags.size(), 5);
        for (int i = 0; i < limit; i++) {
            String value = tags.path(i).asText(null);
            if (value == null || value.isBlank()) {
                continue;
            }
            values.add(value.replace("en:", "").replace('-', ' '));
        }
        if (values.isEmpty()) {
            return null;
        }
        return String.join(", ", values);
    }

    private String normalizeBrand(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String[] split = value.split(",");
        String first = split.length > 0 ? split[0].trim() : value.trim();
        return first.isBlank() ? null : first;
    }

    private String readText(JsonNode node, String field) {
        JsonNode child = node.path(field);
        if (child.isMissingNode() || child.isNull()) {
            return null;
        }
        String text = child.asText(null);
        if (text == null) {
            return null;
        }
        String trimmed = text.trim();
        return trimmed.isBlank() ? null : trimmed;
    }

    private String defaultText(String value) {
        return value == null ? "" : value;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private String normalizeProvider(String provider) {
        if (provider == null || provider.isBlank()) {
            return "EXTERNAL_CATALOG";
        }
        return provider.trim().toUpperCase(Locale.ROOT).replace(' ', '_');
    }

    private String normalizeSourceLicense(String sourceLicense) {
        if (sourceLicense == null || sourceLicense.isBlank()) {
            return "External catalog import";
        }
        return sourceLicense.trim();
    }

    private BigDecimal scaleConfidence(BigDecimal value) {
        if (value == null) {
            return DEFAULT_CONFIDENCE;
        }
        if (value.compareTo(BigDecimal.ZERO) < 0) {
            return BigDecimal.ZERO;
        }
        if (value.compareTo(BigDecimal.ONE) > 0) {
            return BigDecimal.ONE;
        }
        return value;
    }

    private String resolveRawPayload(CatalogImportRecordDTO record) {
        if (record.getRawPayload() != null && !record.getRawPayload().isBlank()) {
            return record.getRawPayload();
        }
        try {
            return objectMapper.writeValueAsString(record);
        } catch (Exception ex) {
            String code = defaultText(record.getCode()).replace("\\", "\\\\").replace("\"", "\\\"");
            String name = defaultText(record.getName()).replace("\\", "\\\\").replace("\"", "\\\"");
            return "{\"code\":\"" + code + "\",\"name\":\"" + name + "\"}";
        }
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private record SourceSpec(String provider, String baseUrl) {
    }
}
