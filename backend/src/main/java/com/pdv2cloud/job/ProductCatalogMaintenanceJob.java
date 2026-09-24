package com.pdv2cloud.job;

import com.pdv2cloud.model.dto.ProductCatalogBackfillResponse;
import com.pdv2cloud.service.ProductCatalogService;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Slf4j
@Profile("jobs")
@ConditionalOnProperty(name = "app.catalog.maintenance.enabled", havingValue = "true", matchIfMissing = true)
public class ProductCatalogMaintenanceJob {

    @Autowired
    private ProductCatalogService productCatalogService;

    private final AtomicBoolean running = new AtomicBoolean(false);

    @Scheduled(
        initialDelayString = "${app.catalog.backfill.initial-delay-ms:30000}",
        fixedDelayString = "${app.catalog.backfill.fixed-delay-ms:43200000}"
    )
    public void backfillCatalog() {
        if (!running.compareAndSet(false, true)) {
            return;
        }

        try {
            ProductCatalogBackfillResponse result = productCatalogService.backfillMissingCatalogData(500, 20);
            if (result.getObservationsCreated() > 0 || result.getAliasesTouched() > 0 || result.getProductsUpdated() > 0) {
                log.info(
                    "Product catalog backfill completed | scanned={} observations={} aliases={} products={}",
                    result.getInvoiceItemsScanned(),
                    result.getObservationsCreated(),
                    result.getAliasesTouched(),
                    result.getProductsUpdated()
                );
            }
        } finally {
            running.set(false);
        }
    }
}
