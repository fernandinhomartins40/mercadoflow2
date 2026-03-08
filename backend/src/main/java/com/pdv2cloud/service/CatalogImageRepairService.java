package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.CatalogImageRepairResponseDTO;
import com.pdv2cloud.model.entity.ProductEnrichment;
import com.pdv2cloud.repository.ProductEnrichmentRepository;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class CatalogImageRepairService {

    private static final String ALL_PROVIDERS = "ALL_PROVIDERS";

    @Autowired
    private ProductEnrichmentRepository productEnrichmentRepository;

    @Autowired
    private CatalogImageStorageService catalogImageStorageService;

    @Value("${app.catalog.image-repair.batch-size:200}")
    private int defaultBatchSize;

    @Value("${app.catalog.image-repair.max-items-per-run:1000}")
    private int defaultMaxItems;

    @Value("${app.catalog.image-repair.provider:}")
    private String defaultProvider;

    private final AtomicBoolean running = new AtomicBoolean(false);

    public CatalogImageRepairResponseDTO runManualRepair(String provider, Integer maxItems, Integer batchSize, String triggeredBy) {
        return runRepair(
            provider,
            maxItems,
            batchSize,
            triggeredBy == null || triggeredBy.isBlank() ? "MANUAL_SUPER_ADMIN_IMAGE_REPAIR" : triggeredBy.trim(),
            true
        );
    }

    public CatalogImageRepairResponseDTO runScheduledRepairIfIdle() {
        if (!running.compareAndSet(false, true)) {
            return null;
        }
        try {
            return executeRepair(
                defaultProvider,
                defaultMaxItems,
                defaultBatchSize,
                "SCHEDULED_CATALOG_IMAGE_REPAIR"
            );
        } finally {
            running.set(false);
        }
    }

    private CatalogImageRepairResponseDTO runRepair(
        String provider,
        Integer maxItems,
        Integer batchSize,
        String triggeredBy,
        boolean failIfRunning
    ) {
        if (!running.compareAndSet(false, true)) {
            if (failIfRunning) {
                throw new IllegalStateException("Ja existe um reparo de imagens do catalogo em execucao.");
            }
            return null;
        }
        try {
            return executeRepair(provider, maxItems, batchSize, triggeredBy);
        } finally {
            running.set(false);
        }
    }

    private CatalogImageRepairResponseDTO executeRepair(
        String provider,
        Integer maxItems,
        Integer batchSize,
        String triggeredBy
    ) {
        String normalizedProvider = normalizeProvider(provider);
        String responseProvider = normalizedProvider.isBlank() ? ALL_PROVIDERS : normalizedProvider;
        int safeBatchSize = Math.max(10, Math.min(batchSize != null ? batchSize : defaultBatchSize, 1000));
        int safeMaxItems = Math.max(safeBatchSize, Math.min(maxItems != null ? maxItems : defaultMaxItems, 250000));

        LocalDateTime startedAt = LocalDateTime.now();
        int scannedEnrichments = 0;
        int alreadyPresent = 0;
        int attemptedRepairs = 0;
        int repairedImages = 0;
        int failedRepairs = 0;
        boolean completed = true;
        int page = 0;

        while (scannedEnrichments < safeMaxItems) {
            Slice<ProductEnrichment> slice = productEnrichmentRepository.findLatestWithImageStorageKeyForRepair(
                normalizedProvider,
                PageRequest.of(page, safeBatchSize)
            );
            if (!slice.hasContent()) {
                break;
            }

            for (ProductEnrichment enrichment : slice.getContent()) {
                if (scannedEnrichments >= safeMaxItems) {
                    completed = false;
                    break;
                }

                scannedEnrichments++;
                String imageStorageKey = enrichment.getImageStorageKey();
                if (imageStorageKey == null || imageStorageKey.isBlank()) {
                    continue;
                }

                if (catalogImageStorageService.hasStoredImage(imageStorageKey)) {
                    alreadyPresent++;
                    continue;
                }

                attemptedRepairs++;
                boolean repaired = catalogImageStorageService.ensureManagedImageAvailable(
                    enrichment.getImageUrl(),
                    imageStorageKey
                );
                if (repaired && catalogImageStorageService.hasStoredImage(imageStorageKey)) {
                    repairedImages++;
                } else {
                    failedRepairs++;
                }
            }

            if (!slice.hasNext()) {
                break;
            }
            if (scannedEnrichments >= safeMaxItems) {
                completed = false;
                break;
            }
            page++;
        }

        LocalDateTime finishedAt = LocalDateTime.now();
        String message = completed
            ? "Reparo de imagens concluido."
            : "Reparo interrompido no limite configurado; continue em nova execucao para varrer o restante.";
        CatalogImageRepairResponseDTO response = new CatalogImageRepairResponseDTO(
            responseProvider,
            triggeredBy,
            startedAt,
            finishedAt,
            safeBatchSize,
            safeMaxItems,
            scannedEnrichments,
            alreadyPresent,
            attemptedRepairs,
            repairedImages,
            failedRepairs,
            completed,
            message
        );

        if (attemptedRepairs > 0 || failedRepairs > 0) {
            log.info(
                "Catalog image repair finished | provider={} scanned={} present={} attempted={} repaired={} failed={} completed={}",
                responseProvider,
                scannedEnrichments,
                alreadyPresent,
                attemptedRepairs,
                repairedImages,
                failedRepairs,
                completed
            );
        }
        return response;
    }

    private String normalizeProvider(String provider) {
        if (provider == null || provider.isBlank()) {
            return "";
        }
        return provider.trim().toUpperCase(Locale.ROOT);
    }
}
