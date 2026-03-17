package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.OfferBackgroundRemovalDTO;
import com.pdv2cloud.model.dto.OfferBackgroundRemovalRequest;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

@Service
public class OfferBackgroundRemovalService {

    private static final Color TRANSPARENT = new Color(255, 255, 255, 0);

    private final CatalogImageStorageService catalogImageStorageService;
    private final CatalogImageUrlResolver catalogImageUrlResolver;
    private final OfferRenderStorageService offerRenderStorageService;
    private final HttpClient httpClient;

    public OfferBackgroundRemovalService(
        CatalogImageStorageService catalogImageStorageService,
        CatalogImageUrlResolver catalogImageUrlResolver,
        OfferRenderStorageService offerRenderStorageService
    ) {
        this.catalogImageStorageService = catalogImageStorageService;
        this.catalogImageUrlResolver = catalogImageUrlResolver;
        this.offerRenderStorageService = offerRenderStorageService;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    }

    public OfferBackgroundRemovalDTO removeBackground(UUID marketId, OfferBackgroundRemovalRequest request) {
        String sourceUrl = resolveSourceUrl(request);
        if (sourceUrl == null) {
            throw new IllegalArgumentException("Imagem nao informada para remocao de fundo");
        }

        BufferedImage source = readSourceImage(sourceUrl);
        if (source == null) {
            throw new IllegalArgumentException("Nao foi possivel carregar a imagem para remocao de fundo");
        }

        BufferedImage cleaned = removeEdgeBackground(source);
        String fileName = "bg-removed-" + shortHash(sourceUrl) + ".png";
        Path target = offerRenderStorageService.resolveAssetFile(marketId, fileName);
        offerRenderStorageService.ensureParent(target);

        try {
            ImageIO.write(cleaned, "png", target.toFile());
        } catch (IOException ex) {
            throw new IllegalStateException("Falha ao persistir imagem sem fundo", ex);
        }

        return new OfferBackgroundRemovalDTO(
            sourceUrl,
            offerRenderStorageService.toPublicUrl(target),
            true
        );
    }

    private String resolveSourceUrl(OfferBackgroundRemovalRequest request) {
        String explicit = catalogImageUrlResolver.normalizeUrl(request.getImageUrl());
        if (explicit != null) {
            return explicit;
        }
        String managed = catalogImageUrlResolver.managedUrl(request.getImageStorageKey());
        if (managed != null) {
            return managed;
        }
        return null;
    }

    private BufferedImage readSourceImage(String sourceUrl) {
        try {
            if (catalogImageUrlResolver.isManagedImage(sourceUrl)) {
                String storageKey = catalogImageUrlResolver.extractManagedStorageKey(sourceUrl);
                Optional<Resource> resource = catalogImageStorageService.loadManagedResource(storageKey);
                if (resource.isPresent()) {
                    try (InputStream inputStream = resource.get().getInputStream()) {
                        return ImageIO.read(inputStream);
                    }
                }
            }
            if (catalogImageUrlResolver.isAbsoluteHttpUrl(sourceUrl)) {
                HttpRequest request = HttpRequest.newBuilder(URI.create(sourceUrl))
                    .timeout(Duration.ofSeconds(30))
                    .header("User-Agent", "MercadoFlowOfferStudio/1.0")
                    .GET()
                    .build();
                HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
                if (response.statusCode() >= 200 && response.statusCode() < 300) {
                    try (InputStream inputStream = response.body()) {
                        return ImageIO.read(inputStream);
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private BufferedImage removeEdgeBackground(BufferedImage source) {
        int width = source.getWidth();
        int height = source.getHeight();
        BufferedImage argb = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);

        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int rgb = source.getRGB(x, y);
                argb.setRGB(x, y, (0xFF << 24) | (rgb & 0x00FFFFFF));
            }
        }

        boolean[][] visited = new boolean[height][width];
        ArrayDeque<int[]> queue = new ArrayDeque<>();

        for (int x = 0; x < width; x++) {
            enqueue(queue, visited, x, 0, width, height);
            enqueue(queue, visited, x, height - 1, width, height);
        }
        for (int y = 1; y < height - 1; y++) {
            enqueue(queue, visited, 0, y, width, height);
            enqueue(queue, visited, width - 1, y, width, height);
        }

        while (!queue.isEmpty()) {
            int[] point = queue.removeFirst();
            int x = point[0];
            int y = point[1];
            Color color = new Color(argb.getRGB(x, y), true);
            if (!isRemovableBackground(color)) {
                continue;
            }
            argb.setRGB(x, y, TRANSPARENT.getRGB());
            enqueue(queue, visited, x + 1, y, width, height);
            enqueue(queue, visited, x - 1, y, width, height);
            enqueue(queue, visited, x, y + 1, width, height);
            enqueue(queue, visited, x, y - 1, width, height);
        }

        return argb;
    }

    private void enqueue(ArrayDeque<int[]> queue, boolean[][] visited, int x, int y, int width, int height) {
        if (x < 0 || y < 0 || x >= width || y >= height || visited[y][x]) {
            return;
        }
        visited[y][x] = true;
        queue.addLast(new int[] { x, y });
    }

    private boolean isRemovableBackground(Color color) {
        return color.getRed() >= 235
            && color.getGreen() >= 235
            && color.getBlue() >= 235;
    }

    private String shortHash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(value.toLowerCase(Locale.ROOT).getBytes());
            return HexFormat.of().formatHex(hashed).substring(0, 16);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("Falha ao gerar hash da imagem", ex);
        }
    }
}
