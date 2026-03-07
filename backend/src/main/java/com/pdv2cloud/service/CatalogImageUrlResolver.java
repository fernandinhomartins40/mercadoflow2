package com.pdv2cloud.service;

import java.net.URI;
import org.springframework.stereotype.Component;

@Component
public class CatalogImageUrlResolver {

    private static final String IMAGE_API_PREFIX = "/api/v1/catalog/images/";

    public String resolve(String imageUrl, String imageStorageKey) {
        String normalizedStorageKey = normalizeStorageKey(imageStorageKey);
        if (normalizedStorageKey != null) {
            return managedUrl(normalizedStorageKey);
        }
        return normalizeUrl(imageUrl);
    }

    public String managedUrl(String imageStorageKey) {
        String normalizedStorageKey = normalizeStorageKey(imageStorageKey);
        if (normalizedStorageKey == null) {
            return null;
        }
        return IMAGE_API_PREFIX + normalizedStorageKey;
    }

    public boolean isManagedImage(String imageUrl) {
        String normalized = normalizeUrl(imageUrl);
        return normalized != null && normalized.startsWith(IMAGE_API_PREFIX);
    }

    public String extractManagedStorageKey(String imageUrl) {
        String normalized = normalizeUrl(imageUrl);
        if (normalized == null || !normalized.startsWith(IMAGE_API_PREFIX)) {
            return null;
        }
        return normalizeStorageKey(normalized.substring(IMAGE_API_PREFIX.length()));
    }

    public String normalizeStorageKey(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim().replace("\\", "/");
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        return normalized.isBlank() ? null : normalized;
    }

    public String normalizeUrl(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.startsWith("//")) {
            normalized = "https:" + normalized;
        }
        return normalized.isBlank() ? null : normalized;
    }

    public boolean isAbsoluteHttpUrl(String value) {
        String normalized = normalizeUrl(value);
        if (normalized == null || normalized.startsWith(IMAGE_API_PREFIX)) {
            return false;
        }
        try {
            URI uri = URI.create(normalized);
            String scheme = uri.getScheme();
            return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }
}
