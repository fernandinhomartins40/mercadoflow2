package com.pdv2cloud.service;

import org.springframework.stereotype.Component;

@Component
public class CatalogImageUrlResolver {

    private static final String IMAGE_API_PREFIX = "/api/v1/catalog/images/";

    public String resolve(String imageUrl, String imageStorageKey) {
        String normalizedStorageKey = normalizeStorageKey(imageStorageKey);
        if (normalizedStorageKey != null) {
            return IMAGE_API_PREFIX + normalizedStorageKey;
        }
        return normalizeUrl(imageUrl);
    }

    public boolean isManagedImage(String imageUrl) {
        String normalized = normalizeUrl(imageUrl);
        return normalized != null && normalized.startsWith(IMAGE_API_PREFIX);
    }

    private String normalizeStorageKey(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim().replace("\\", "/");
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        return normalized.isBlank() ? null : normalized;
    }

    private String normalizeUrl(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isBlank() ? null : normalized;
    }
}
