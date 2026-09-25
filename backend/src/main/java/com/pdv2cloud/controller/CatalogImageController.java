package com.pdv2cloud.controller;

import org.springframework.context.annotation.Profile;

import com.pdv2cloud.service.CatalogImageStorageService;
import java.net.URI;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/catalog/images")
public class CatalogImageController {

    private final CatalogImageStorageService catalogImageStorageService;

    public CatalogImageController(CatalogImageStorageService catalogImageStorageService) {
        this.catalogImageStorageService = catalogImageStorageService;
    }

    @GetMapping("/{provider}/{fileName:.+}")
    public ResponseEntity<?> getCatalogImage(
        @PathVariable String provider,
        @PathVariable String fileName
    ) {
        String imageStorageKey = provider + "/" + fileName;
        return catalogImageStorageService.loadManagedResource(imageStorageKey)
            .<ResponseEntity<?>>map(resource -> {
                MediaType mediaType = catalogImageStorageService.detectMediaType(imageStorageKey);
                return ResponseEntity.ok()
                    .cacheControl(CacheControl.maxAge(Duration.ofHours(12)).cachePublic())
                    .contentType(mediaType)
                    .body(resource);
            })
            .orElseGet(() -> {
                String fallbackUrl = catalogImageStorageService.resolveFallbackSourceUrl(imageStorageKey);
                if (fallbackUrl != null) {
                    return ResponseEntity.status(HttpStatus.FOUND)
                        .header(HttpHeaders.LOCATION, URI.create(fallbackUrl).toString())
                        .build();
                }
                return ResponseEntity.notFound().build();
            });
    }
}
