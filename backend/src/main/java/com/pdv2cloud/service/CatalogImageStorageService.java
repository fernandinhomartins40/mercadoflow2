package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.ProductEnrichment;
import com.pdv2cloud.repository.ProductEnrichmentRepository;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.PathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class CatalogImageStorageService {

    private static final long DEFAULT_MAX_IMAGE_BYTES = 5_000_000L;
    private static final String DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; MercadoFlowCatalogRecovery/1.0)";

    private final CatalogImageUrlResolver catalogImageUrlResolver;
    private final ProductEnrichmentRepository productEnrichmentRepository;
    private final Path catalogImagesDir;
    private final long maxImageBytes;
    private final HttpClient httpClient;

    public CatalogImageStorageService(
        CatalogImageUrlResolver catalogImageUrlResolver,
        ProductEnrichmentRepository productEnrichmentRepository,
        @Value("${app.catalog.images-dir:../data/catalog/images}") String catalogImagesDir,
        @Value("${app.catalog.max-image-bytes:5000000}") long maxImageBytes
    ) {
        this.catalogImageUrlResolver = catalogImageUrlResolver;
        this.productEnrichmentRepository = productEnrichmentRepository;
        this.catalogImagesDir = Paths.get(catalogImagesDir).toAbsolutePath().normalize();
        this.maxImageBytes = Math.max(256_000L, maxImageBytes);
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    }

    public String resolveCatalogImageUrl(String imageUrl, String imageStorageKey) {
        String normalizedUrl = catalogImageUrlResolver.normalizeUrl(imageUrl);
        String normalizedStorageKey = catalogImageUrlResolver.normalizeStorageKey(imageStorageKey);
        if (normalizedStorageKey == null) {
            return normalizedUrl;
        }

        Path imagePath = resolveStoragePath(normalizedStorageKey);
        if (imagePath != null && Files.isRegularFile(imagePath)) {
            return catalogImageUrlResolver.managedUrl(normalizedStorageKey);
        }

        if (normalizedUrl != null && restoreImage(normalizedStorageKey, normalizedUrl)) {
            return catalogImageUrlResolver.managedUrl(normalizedStorageKey);
        }

        return normalizedUrl;
    }

    public Optional<Resource> loadManagedResource(String imageStorageKey) {
        Path imagePath = resolveStoragePath(imageStorageKey);
        if (imagePath == null) {
            return Optional.empty();
        }
        if (Files.isRegularFile(imagePath)) {
            return Optional.of(new PathResource(imagePath));
        }

        Optional<ProductEnrichment> enrichment = findEnrichmentByStorageKey(imageStorageKey);
        if (enrichment.isPresent() && restoreImage(imageStorageKey, enrichment.get().getImageUrl()) && Files.isRegularFile(imagePath)) {
            return Optional.of(new PathResource(imagePath));
        }

        return Optional.empty();
    }

    public String resolveFallbackSourceUrl(String imageStorageKey) {
        return findEnrichmentByStorageKey(imageStorageKey)
            .map(ProductEnrichment::getImageUrl)
            .map(catalogImageUrlResolver::normalizeUrl)
            .orElse(null);
    }

    public MediaType detectMediaType(String imageStorageKey) {
        Path imagePath = resolveStoragePath(imageStorageKey);
        if (imagePath == null || !Files.isRegularFile(imagePath)) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            String detected = Files.probeContentType(imagePath);
            if (detected != null && !detected.isBlank()) {
                return MediaType.parseMediaType(detected);
            }
        } catch (Exception ignored) {
        }
        String lowerName = imagePath.getFileName().toString().toLowerCase(Locale.ROOT);
        if (lowerName.endsWith(".png")) {
            return MediaType.IMAGE_PNG;
        }
        if (lowerName.endsWith(".webp")) {
            return MediaType.parseMediaType("image/webp");
        }
        if (lowerName.endsWith(".gif")) {
            return MediaType.IMAGE_GIF;
        }
        if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
            return MediaType.IMAGE_JPEG;
        }
        return MediaType.APPLICATION_OCTET_STREAM;
    }

    private Optional<ProductEnrichment> findEnrichmentByStorageKey(String imageStorageKey) {
        String normalizedStorageKey = catalogImageUrlResolver.normalizeStorageKey(imageStorageKey);
        if (normalizedStorageKey == null) {
            return Optional.empty();
        }
        return productEnrichmentRepository.findTopByImageStorageKeyOrderByFetchedAtDesc(normalizedStorageKey);
    }

    private boolean restoreImage(String imageStorageKey, String imageUrl) {
        String normalizedStorageKey = catalogImageUrlResolver.normalizeStorageKey(imageStorageKey);
        String normalizedUrl = catalogImageUrlResolver.normalizeUrl(imageUrl);
        Path imagePath = resolveStoragePath(normalizedStorageKey);
        if (normalizedStorageKey == null || normalizedUrl == null || imagePath == null) {
            return false;
        }
        if (Files.isRegularFile(imagePath)) {
            return true;
        }

        try {
            Files.createDirectories(imagePath.getParent());
            HttpRequest request = HttpRequest.newBuilder(URI.create(normalizedUrl))
                .timeout(Duration.ofSeconds(30))
                .header("User-Agent", DEFAULT_USER_AGENT)
                .GET()
                .build();
            Path tempFile = Files.createTempFile(imagePath.getParent(), "catalog-image-", ".tmp");
            try {
                HttpResponse<Path> response = httpClient.send(request, HttpResponse.BodyHandlers.ofFile(tempFile));
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    Files.deleteIfExists(tempFile);
                    return false;
                }
                String contentType = response.headers().firstValue("content-type").orElse("");
                String normalizedContentType = contentType.toLowerCase(Locale.ROOT);
                if (!normalizedContentType.isBlank()
                    && !normalizedContentType.startsWith("image/")
                    && !normalizedContentType.contains("octet-stream")) {
                    Files.deleteIfExists(tempFile);
                    return false;
                }

                long size = Files.size(tempFile);
                if (size <= 0 || size > maxImageBytes) {
                    Files.deleteIfExists(tempFile);
                    return false;
                }

                Files.move(tempFile, imagePath, StandardCopyOption.REPLACE_EXISTING);
                log.info("Recovered missing catalog image | key={} source={}", normalizedStorageKey, normalizedUrl);
                return true;
            } finally {
                Files.deleteIfExists(tempFile);
            }
        } catch (IOException | InterruptedException ex) {
            if (ex instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn(
                "Failed to recover missing catalog image | key={} source={} error={}",
                normalizedStorageKey,
                normalizedUrl,
                ex.getMessage()
            );
            return false;
        }
    }

    private Path resolveStoragePath(String imageStorageKey) {
        String normalizedStorageKey = catalogImageUrlResolver.normalizeStorageKey(imageStorageKey);
        if (normalizedStorageKey == null) {
            return null;
        }

        Path resolved = catalogImagesDir.resolve(normalizedStorageKey).normalize();
        if (!resolved.startsWith(catalogImagesDir)) {
            log.warn("Rejected catalog image path outside storage dir | key={}", normalizedStorageKey);
            return null;
        }
        return resolved;
    }
}
