package com.pdv2cloud.service;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.UUID;
import javax.imageio.ImageIO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@Slf4j
public class OfferAssetStorageService {

    private final OfferRenderStorageService offerRenderStorageService;

    public OfferAssetStorageService(OfferRenderStorageService offerRenderStorageService) {
        this.offerRenderStorageService = offerRenderStorageService;
    }

    public StoredAsset storeUploadedAsset(UUID marketId, String scope, MultipartFile file, int maxWidth, int maxHeight) {
        if (marketId == null) {
            throw new IllegalArgumentException("Mercado nao informado para o upload");
        }
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Nenhum arquivo foi enviado");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            throw new IllegalArgumentException("Envie um arquivo de imagem valido");
        }
        String normalizedScope = normalizeScope(scope);
        String fileName = normalizedScope + "-" + UUID.randomUUID() + ".png";
        String storageKey = normalizedScope + "/" + fileName;
        Path target = offerRenderStorageService.resolveAssetFile(marketId, storageKey);
        offerRenderStorageService.ensureParent(target);

        try {
            BufferedImage sourceImage = ImageIO.read(file.getInputStream());
            if (sourceImage == null) {
                throw new IllegalArgumentException("Arquivo enviado nao e uma imagem valida");
            }
            BufferedImage normalized = normalizeContainedImage(sourceImage, Math.max(64, maxWidth), Math.max(64, maxHeight));
            Path tempFile = Files.createTempFile(target.getParent(), "offer-asset-", ".png");
            try {
                ImageIO.write(normalized, "png", tempFile.toFile());
                Files.move(tempFile, target, StandardCopyOption.REPLACE_EXISTING);
            } finally {
                Files.deleteIfExists(tempFile);
            }
            return new StoredAsset(
                offerRenderStorageService.toPublicUrl(target),
                storageKey.replace("\\", "/"),
                normalized.getWidth(),
                normalized.getHeight()
            );
        } catch (IOException ex) {
            log.warn("Falha ao salvar asset do estudio de ofertas | marketId={} scope={} error={}", marketId, normalizedScope, ex.getMessage());
            throw new IllegalStateException("Falha ao persistir a imagem enviada", ex);
        }
    }

    private BufferedImage normalizeContainedImage(BufferedImage sourceImage, int maxWidth, int maxHeight) {
        int sourceWidth = Math.max(1, sourceImage.getWidth());
        int sourceHeight = Math.max(1, sourceImage.getHeight());
        double scale = Math.min(
            1d,
            Math.min(maxWidth / (double) sourceWidth, maxHeight / (double) sourceHeight)
        );
        int targetWidth = Math.max(1, (int) Math.round(sourceWidth * scale));
        int targetHeight = Math.max(1, (int) Math.round(sourceHeight * scale));
        BufferedImage normalized = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = normalized.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(sourceImage, 0, 0, targetWidth, targetHeight, 0, 0, sourceWidth, sourceHeight, null);
        } finally {
            graphics.dispose();
        }
        return normalized;
    }

    private String normalizeScope(String value) {
        String normalized = value == null ? "asset" : value.trim().toLowerCase(Locale.ROOT);
        normalized = normalized.replaceAll("[^a-z0-9/_-]+", "-").replaceAll("(^-|-$)", "");
        return normalized.isBlank() ? "asset" : normalized;
    }

    public record StoredAsset(String assetUrl, String storageKey, int width, int height) {}
}
