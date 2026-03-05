package com.pdv2cloud.job;

import com.pdv2cloud.model.dto.CatalogWebImportResponseDTO;
import com.pdv2cloud.service.WebCatalogImportService;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;

@Component
@Slf4j
@ConditionalOnProperty(name = "app.catalog.web-import.enabled", havingValue = "true")
public class WebCatalogImportJob {

    @Autowired
    private WebCatalogImportService webCatalogImportService;

    @Value("${app.catalog.web-import.max-pages-per-source:5}")
    private int maxPagesPerSource;

    @Value("${app.catalog.web-import.page-size:100}")
    private int pageSize;

    @Value("${app.catalog.web-import.include-beauty-facts:true}")
    private boolean includeBeautyFacts;

    @Value("${app.catalog.web-import.include-open-products-facts:true}")
    private boolean includeOpenProductsFacts;

    private final AtomicBoolean running = new AtomicBoolean(false);

    @Scheduled(
        initialDelayString = "${app.catalog.web-import.initial-delay-ms:180000}",
        fixedDelayString = "${app.catalog.web-import.fixed-delay-ms:86400000}"
    )
    public void runWebCatalogImport() {
        if (!running.compareAndSet(false, true)) {
            return;
        }

        try {
            CatalogWebImportResponseDTO result = webCatalogImportService.importFromPublicSources(
                maxPagesPerSource,
                pageSize,
                includeBeautyFacts,
                includeOpenProductsFacts
            );
            log.info(
                "Web catalog import completed | scanned={} imported={} skippedInvalid={} skippedMedication={} duplicates={} errors={}",
                result.getScannedProducts(),
                result.getImportedProducts(),
                result.getSkippedInvalidGtin(),
                result.getSkippedMedication(),
                result.getSkippedDuplicateGtin(),
                result.getErrors()
            );
        } catch (Exception ex) {
            log.warn("Web catalog import job failed: {}", ex.getMessage(), ex);
        } finally {
            running.set(false);
        }
    }
}
