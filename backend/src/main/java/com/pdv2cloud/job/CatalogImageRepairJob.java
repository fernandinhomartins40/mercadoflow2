package com.pdv2cloud.job;

import com.pdv2cloud.model.dto.CatalogImageRepairResponseDTO;
import com.pdv2cloud.service.CatalogImageRepairService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Slf4j
@Profile("jobs")
@ConditionalOnProperty(name = "app.catalog.image-repair.enabled", havingValue = "true")
public class CatalogImageRepairJob {

    @Autowired
    private CatalogImageRepairService catalogImageRepairService;

    @Scheduled(
        initialDelayString = "${app.catalog.image-repair.initial-delay-ms:900000}",
        fixedDelayString = "${app.catalog.image-repair.fixed-delay-ms:21600000}"
    )
    public void repairMissingCatalogImages() {
        try {
            CatalogImageRepairResponseDTO result = catalogImageRepairService.runScheduledRepairIfIdle();
            if (result == null) {
                return;
            }
            if (result.getAttemptedRepairs() > 0 || result.getFailedRepairs() > 0) {
                log.info(
                    "Scheduled catalog image repair finished | provider={} scanned={} attempted={} repaired={} failed={} completed={}",
                    result.getProvider(),
                    result.getScannedEnrichments(),
                    result.getAttemptedRepairs(),
                    result.getRepairedImages(),
                    result.getFailedRepairs(),
                    result.isCompleted()
                );
            }
        } catch (Exception ex) {
            log.warn("Catalog image repair job failed: {}", ex.getMessage(), ex);
        }
    }
}
