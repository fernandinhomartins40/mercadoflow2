package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.SuperAdminCrawlerCatalogImageStatusDTO;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.model.entity.ProductEnrichment;
import com.pdv2cloud.repository.ProductEnrichmentRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.util.ProductCatalogUtils;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CatalogCrawlerCatalogStatusService {

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductEnrichmentRepository productEnrichmentRepository;

    @Autowired
    private CatalogImageStorageService catalogImageStorageService;

    public List<SuperAdminCrawlerCatalogImageStatusDTO> auditCatalogImageStatus(String provider, Collection<String> codes) {
        String normalizedProvider = provider == null ? "" : provider.trim().toUpperCase(Locale.ROOT);
        List<String> normalizedCodes = normalizeCodes(codes);
        if (normalizedCodes.isEmpty()) {
            return List.of();
        }

        Map<String, Product> productsByCode = new LinkedHashMap<>();
        for (Product product : productRepository.findAllByEanIn(normalizedCodes)) {
            if (product.getEan() != null && !product.getEan().isBlank()) {
                productsByCode.put(product.getEan(), product);
            }
        }

        Map<String, ProductEnrichment> enrichmentsByCode = new LinkedHashMap<>();
        for (ProductEnrichment enrichment : productEnrichmentRepository.findAllByProduct_EanInAndProviderOrderByFetchedAtDesc(normalizedCodes, normalizedProvider)) {
            Product product = enrichment.getProduct();
            String gtin = product != null ? product.getEan() : null;
            if (gtin != null && !gtin.isBlank()) {
                enrichmentsByCode.putIfAbsent(gtin, enrichment);
            }
        }

        List<SuperAdminCrawlerCatalogImageStatusDTO> result = new ArrayList<>();
        for (String code : normalizedCodes) {
            Product product = productsByCode.get(code);
            ProductEnrichment enrichment = enrichmentsByCode.get(code);

            boolean productImageAvailable = product != null
                && catalogImageStorageService.ensureManagedImageAvailable(product.getImageUrl(), null);
            boolean enrichmentImageAvailable = enrichment != null
                && catalogImageStorageService.ensureManagedImageAvailable(enrichment.getImageUrl(), enrichment.getImageStorageKey());

            boolean imageAvailable = productImageAvailable || enrichmentImageAvailable;
            String resolvedImageUrl = "";
            String imageStorageKey = "";
            String reason = "";

            if (enrichment != null && enrichmentImageAvailable) {
                resolvedImageUrl = catalogImageStorageService.resolveCatalogImageUrl(enrichment.getImageUrl(), enrichment.getImageStorageKey());
                imageStorageKey = enrichment.getImageStorageKey();
            } else if (product != null && productImageAvailable) {
                resolvedImageUrl = product.getImageUrl();
            }

            if (product == null) {
                reason = "PRODUCT_NOT_FOUND";
            } else if (imageAvailable) {
                reason = "IMAGE_OK";
            } else if (enrichment == null) {
                reason = "ENRICHMENT_NOT_FOUND";
            } else if (enrichment.getImageStorageKey() == null || enrichment.getImageStorageKey().isBlank()) {
                reason = "IMAGE_NOT_STORED";
            } else {
                reason = "STORAGE_FILE_MISSING";
                imageStorageKey = enrichment.getImageStorageKey();
            }

            result.add(
                new SuperAdminCrawlerCatalogImageStatusDTO(
                    code,
                    product != null,
                    imageAvailable,
                    !imageAvailable,
                    reason,
                    resolvedImageUrl,
                    imageStorageKey
                )
            );
        }
        return result;
    }

    private List<String> normalizeCodes(Collection<String> codes) {
        if (codes == null || codes.isEmpty()) {
            return List.of();
        }
        Set<String> normalized = new LinkedHashSet<>();
        for (String code : codes) {
            String gtin = ProductCatalogUtils.normalizeGtin(code);
            if (gtin != null) {
                normalized.add(gtin);
            }
        }
        return new ArrayList<>(normalized);
    }
}
