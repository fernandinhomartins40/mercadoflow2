package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.ProductEnrichment;
import com.pdv2cloud.repository.ProductEnrichmentRepository;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
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
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.FileImageOutputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.PathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@Slf4j
public class CatalogImageStorageService {

    private static final long DEFAULT_MAX_IMAGE_BYTES = 5_000_000L;
    private static final String DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; MercadoFlowCatalogRecovery/1.0)";

    private final CatalogImageUrlResolver catalogImageUrlResolver;
    private final ProductEnrichmentRepository productEnrichmentRepository;
    private final Path catalogImagesDir;
    private final long maxImageBytes;
    private final long maxUploadImageBytes;
    private final HttpClient httpClient;

    public CatalogImageStorageService(
        CatalogImageUrlResolver catalogImageUrlResolver,
        ProductEnrichmentRepository productEnrichmentRepository,
        @Value("${app.catalog.images-dir:../data/catalog/images}") String catalogImagesDir,
        @Value("${app.catalog.max-image-bytes:5000000}") long maxImageBytes,
        @Value("${app.catalog.max-upload-image-bytes:12000000}") long maxUploadImageBytes
    ) {
        this.catalogImageUrlResolver = catalogImageUrlResolver;
        this.productEnrichmentRepository = productEnrichmentRepository;
        this.catalogImagesDir = Paths.get(catalogImagesDir).toAbsolutePath().normalize();
        this.maxImageBytes = Math.max(256_000L, maxImageBytes);
        this.maxUploadImageBytes = Math.max(this.maxImageBytes, maxUploadImageBytes);
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

        String recoverySourceUrl = resolveRecoverySourceUrl(normalizedStorageKey, normalizedUrl);
        if (recoverySourceUrl != null && restoreImage(normalizedStorageKey, recoverySourceUrl)) {
            return catalogImageUrlResolver.managedUrl(normalizedStorageKey);
        }

        if (catalogImageUrlResolver.isManagedImage(normalizedUrl)) {
            return catalogImageUrlResolver.managedUrl(normalizedStorageKey);
        }

        return normalizedUrl;
    }

    public boolean hasStoredImage(String imageStorageKey) {
        Path imagePath = resolveStoragePath(imageStorageKey);
        return imagePath != null && Files.isRegularFile(imagePath);
    }

    public boolean ensureManagedImageAvailable(String imageUrl, String imageStorageKey) {
        String normalizedStorageKey = catalogImageUrlResolver.normalizeStorageKey(imageStorageKey);
        if (normalizedStorageKey != null) {
            if (hasStoredImage(normalizedStorageKey)) {
                return true;
            }
            return loadManagedResource(normalizedStorageKey).isPresent();
        }
        String managedStorageKey = catalogImageUrlResolver.extractManagedStorageKey(imageUrl);
        if (managedStorageKey != null) {
            if (hasStoredImage(managedStorageKey)) {
                return true;
            }
            return loadManagedResource(managedStorageKey).isPresent();
        }
        return false;
    }

    public String storeUploadedSquareImage(String imageStorageKey, MultipartFile file) {
        String normalizedStorageKey = catalogImageUrlResolver.normalizeStorageKey(imageStorageKey);
        Path imagePath = resolveStoragePath(normalizedStorageKey);
        if (normalizedStorageKey == null || imagePath == null) {
            throw new IllegalArgumentException("Chave de storage invalida para a imagem");
        }
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Nenhuma imagem foi enviada");
        }
        if (file.getSize() > maxUploadImageBytes) {
            throw new IllegalArgumentException("Imagem excede o limite permitido para upload");
        }

        try {
            Files.createDirectories(imagePath.getParent());
            BufferedImage sourceImage = ImageIO.read(file.getInputStream());
            if (sourceImage == null) {
                throw new IllegalArgumentException("Arquivo enviado nao e uma imagem valida");
            }
            BufferedImage normalizedImage = normalizeSquareImage(sourceImage);
            Path tempFile = Files.createTempFile(imagePath.getParent(), "catalog-upload-", ".jpg");
            try {
                if (!ImageIO.write(normalizedImage, "jpg", tempFile.toFile())) {
                    throw new IllegalStateException("Nao foi possivel salvar a imagem enviada");
                }
                Files.move(tempFile, imagePath, StandardCopyOption.REPLACE_EXISTING);
            } finally {
                Files.deleteIfExists(tempFile);
            }
            return catalogImageUrlResolver.managedUrl(normalizedStorageKey);
        } catch (IOException ex) {
            throw new IllegalStateException("Falha ao persistir a imagem enviada", ex);
        }
    }

    public boolean deleteManagedImage(String imageStorageKey) {
        Path imagePath = resolveStoragePath(imageStorageKey);
        if (imagePath == null) {
            return false;
        }
        try {
            return Files.deleteIfExists(imagePath);
        } catch (IOException ex) {
            throw new IllegalStateException("Falha ao remover a imagem do storage", ex);
        }
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
            .filter(catalogImageUrlResolver::isAbsoluteHttpUrl)
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
        if (normalizedStorageKey == null
            || normalizedUrl == null
            || imagePath == null
            || !catalogImageUrlResolver.isAbsoluteHttpUrl(normalizedUrl)) {
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

                if (!persistRecoveredImage(tempFile, imagePath)) {
                    Files.deleteIfExists(tempFile);
                    return false;
                }
                log.info("Recovered missing catalog image | key={} source={}", normalizedStorageKey, normalizedUrl);
                return true;
            } finally {
                Files.deleteIfExists(tempFile);
            }
        } catch (IOException | InterruptedException | IllegalArgumentException ex) {
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

    private String resolveRecoverySourceUrl(String imageStorageKey, String imageUrl) {
        String normalizedUrl = catalogImageUrlResolver.normalizeUrl(imageUrl);
        if (catalogImageUrlResolver.isAbsoluteHttpUrl(normalizedUrl)) {
            return normalizedUrl;
        }
        return resolveFallbackSourceUrl(imageStorageKey);
    }

    private BufferedImage normalizeSquareImage(BufferedImage sourceImage) {
        int width = sourceImage.getWidth();
        int height = sourceImage.getHeight();
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException("Imagem enviada nao possui dimensoes validas");
        }

        int longestSide = Math.max(width, height);
        int outputSize = Math.min(longestSide, 1200);
        double scale = Math.min((double) outputSize / (double) width, (double) outputSize / (double) height);
        int targetWidth = Math.max(1, (int) Math.round(width * scale));
        int targetHeight = Math.max(1, (int) Math.round(height * scale));
        int targetX = Math.max(0, (outputSize - targetWidth) / 2);
        int targetY = Math.max(0, (outputSize - targetHeight) / 2);

        BufferedImage normalized = new BufferedImage(outputSize, outputSize, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = normalized.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, outputSize, outputSize);
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(
                sourceImage,
                targetX,
                targetY,
                targetX + targetWidth,
                targetY + targetHeight,
                0,
                0,
                width,
                height,
                null
            );
        } finally {
            graphics.dispose();
        }
        return normalized;
    }

    private boolean persistRecoveredImage(Path tempFile, Path imagePath) throws IOException {
        String lowerName = imagePath.getFileName().toString().toLowerCase(Locale.ROOT);
        if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
            BufferedImage sourceImage = ImageIO.read(tempFile.toFile());
            if (sourceImage == null) {
                return false;
            }
            BufferedImage normalized = normalizeContainedImage(sourceImage, 1600);
            writeJpeg(normalized, imagePath);
            Files.deleteIfExists(tempFile);
            return true;
        }
        Files.move(tempFile, imagePath, StandardCopyOption.REPLACE_EXISTING);
        return true;
    }

    private BufferedImage normalizeContainedImage(BufferedImage sourceImage, int maxSide) {
        int width = sourceImage.getWidth();
        int height = sourceImage.getHeight();
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException("Imagem nao possui dimensoes validas");
        }

        double scale = Math.min(1d, (double) maxSide / (double) Math.max(width, height));
        int targetWidth = Math.max(1, (int) Math.round(width * scale));
        int targetHeight = Math.max(1, (int) Math.round(height * scale));
        BufferedImage normalized = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = normalized.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, targetWidth, targetHeight);
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(sourceImage, 0, 0, targetWidth, targetHeight, 0, 0, width, height, null);
        } finally {
            graphics.dispose();
        }
        return normalized;
    }

    private void writeJpeg(BufferedImage image, Path target) throws IOException {
        var writers = ImageIO.getImageWritersByFormatName("jpg");
        if (!writers.hasNext()) {
            throw new IOException("Nenhum writer JPEG disponivel para persistir imagem");
        }
        ImageWriter writer = writers.next();
        ImageWriteParam params = writer.getDefaultWriteParam();
        if (params.canWriteCompressed()) {
            params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            params.setCompressionQuality(0.82f);
        }
        try (FileImageOutputStream outputStream = new FileImageOutputStream(target.toFile())) {
            writer.setOutput(outputStream);
            writer.write(null, new IIOImage(image, null, null), params);
        } finally {
            writer.dispose();
        }
    }
}
