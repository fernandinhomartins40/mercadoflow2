package com.pdv2cloud.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class OfferRenderStorageService {

    private static final String PUBLIC_PREFIX = "/api/v1/generated/offers/";

    private final Path outputsDir;

    public OfferRenderStorageService(
        @Value("${app.offers.outputs-dir:../data/offers}") String outputsDir
    ) {
        this.outputsDir = Paths.get(outputsDir).toAbsolutePath().normalize();
    }

    public Path getOutputsDir() {
        return outputsDir;
    }

    public Path jobDir(UUID jobId) {
        return outputsDir.resolve("jobs").resolve(jobId.toString()).normalize();
    }

    public Path assetDir(UUID marketId) {
        return outputsDir.resolve("assets").resolve(marketId.toString()).normalize();
    }

    public Path resolveJobFile(UUID jobId, String fileName) {
        return jobDir(jobId).resolve(fileName).normalize();
    }

    public Path resolveAssetFile(UUID marketId, String fileName) {
        return assetDir(marketId).resolve(fileName).normalize();
    }

    public void ensureParent(Path path) {
        try {
            Files.createDirectories(path.getParent());
        } catch (IOException ex) {
            throw new IllegalStateException("Falha ao preparar diretorio de render", ex);
        }
    }

    public String toPublicUrl(Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        Path relative = outputsDir.relativize(normalized);
        String publicPath = relative.toString().replace("\\", "/");
        return PUBLIC_PREFIX + publicPath;
    }

    public Path resolvePublicPath(String publicUrl) {
        if (publicUrl == null || publicUrl.isBlank() || !publicUrl.startsWith(PUBLIC_PREFIX)) {
            return null;
        }
        String relativePath = publicUrl.substring(PUBLIC_PREFIX.length());
        if (relativePath.isBlank()) {
            return null;
        }
        Path resolved = outputsDir.resolve(relativePath).normalize();
        if (!resolved.startsWith(outputsDir)) {
            return null;
        }
        return resolved;
    }
}
