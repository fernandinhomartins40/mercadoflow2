package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.CatalogImageRepairResponseDTO;
import com.pdv2cloud.repository.CatalogImageRepairStore;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class CatalogImageRepairService {

    private static final String ALL_PROVIDERS = "ALL_PROVIDERS";
    static final String SCHEDULED_JOB_NAME = "SCHEDULED_CATALOG_IMAGE_REPAIR";
    // Teto do disparo agendado, mesmo que CATALOG_IMAGE_REPAIR_MAX_ITEMS_PER_RUN
    // venha maior (a VPS usa 250000): a varredura completa anda em janelas.
    static final int SCHEDULED_MAX_ITEMS_CAP = 20000;

    @Autowired
    private CatalogImageRepairStore catalogImageRepairStore;

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

    /**
     * Uma janela por disparo: retoma do product_id guardado no cursor, confere no
     * disco no máximo SCHEDULED_MAX_ITEMS_CAP itens e grava onde parou. Ao chegar
     * ao fim da tabela zera o cursor, e a próxima execução começa outra volta.
     */
    public CatalogImageRepairResponseDTO runScheduledRepairIfIdle() {
        if (!running.compareAndSet(false, true)) {
            return null;
        }
        try {
            Optional<CatalogImageRepairStore.Cursor> cursor = catalogImageRepairStore.loadCursor(SCHEDULED_JOB_NAME);
            UUID after = cursor.map(CatalogImageRepairStore.Cursor::lastProductId).orElse(null);
            LocalDateTime passStartedAt = cursor
                .map(CatalogImageRepairStore.Cursor::passStartedAt)
                .filter(started -> after != null)
                .orElse(LocalDateTime.now());
            int scheduledMaxItems = Math.min(defaultMaxItems, SCHEDULED_MAX_ITEMS_CAP);
            RepairOutcome outcome = executeRepair(
                defaultProvider,
                scheduledMaxItems,
                defaultBatchSize,
                "SCHEDULED_CATALOG_IMAGE_REPAIR",
                after
            );
            CatalogImageRepairResponseDTO result = outcome.response();
            catalogImageRepairStore.saveCursor(
                SCHEDULED_JOB_NAME,
                result.isCompleted() ? null : outcome.lastProductId(),
                result.isCompleted() ? null : passStartedAt,
                result.getScannedEnrichments()
            );
            return result;
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
            // O manual sempre começa do início e não mexe no cursor do agendado.
            return executeRepair(provider, maxItems, batchSize, triggeredBy, null).response();
        } finally {
            running.set(false);
        }
    }

    /** Resposta e o último product_id conferido (nulo se nada foi lido). */
    record RepairOutcome(CatalogImageRepairResponseDTO response, UUID lastProductId) {
    }

    private RepairOutcome executeRepair(
        String provider,
        Integer maxItems,
        Integer batchSize,
        String triggeredBy,
        UUID afterProductId
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
        UUID cursor = afterProductId;
        UUID lastScanned = null;

        // Paginação por chave: cada lote pede product_id > último visto, nunca OFFSET.
        while (scannedEnrichments < safeMaxItems) {
            int limit = Math.min(safeBatchSize, safeMaxItems - scannedEnrichments);
            List<CatalogImageRepairStore.Candidate> batch =
                catalogImageRepairStore.findCandidatesAfter(cursor, normalizedProvider, limit);
            if (batch.isEmpty()) {
                break;
            }

            for (CatalogImageRepairStore.Candidate candidate : batch) {
                scannedEnrichments++;
                lastScanned = candidate.productId();
                String imageStorageKey = candidate.imageStorageKey();
                if (imageStorageKey == null || imageStorageKey.isBlank()) {
                    continue;
                }

                if (catalogImageStorageService.hasStoredImage(imageStorageKey)) {
                    alreadyPresent++;
                    continue;
                }

                attemptedRepairs++;
                boolean repaired = catalogImageStorageService.ensureManagedImageAvailable(
                    candidate.imageUrl(),
                    imageStorageKey
                );
                if (repaired && catalogImageStorageService.hasStoredImage(imageStorageKey)) {
                    repairedImages++;
                } else {
                    failedRepairs++;
                }
            }

            cursor = lastScanned;
            if (batch.size() < limit) {
                break;
            }
            if (scannedEnrichments >= safeMaxItems) {
                completed = false;
                break;
            }
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
        return new RepairOutcome(response, lastScanned);
    }

    private String normalizeProvider(String provider) {
        if (provider == null || provider.isBlank()) {
            return "";
        }
        return provider.trim().toUpperCase(Locale.ROOT);
    }
}
