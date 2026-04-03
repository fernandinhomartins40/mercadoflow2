package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.CatalogAdminProductDTO;
import com.pdv2cloud.model.dto.CatalogRecordsImportRequestDTO;
import com.pdv2cloud.model.dto.CatalogWebImportResponseDTO;
import com.pdv2cloud.model.dto.ProductCatalogBackfillResponse;
import com.pdv2cloud.model.dto.ProductEnrichmentUpsertRequest;
import com.pdv2cloud.model.entity.ProductEnrichment;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductEnrichmentRepository;
import com.pdv2cloud.repository.ProductObservationRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.service.ProductCatalogService;
import com.pdv2cloud.service.WebCatalogImportService;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasAnyRole('ADMIN', 'SUPER_ADMIN')")
public class AdminController {

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductObservationRepository productObservationRepository;

    @Autowired
    private ProductEnrichmentRepository productEnrichmentRepository;

    @Autowired
    private ProductCatalogService productCatalogService;

    @Autowired
    private WebCatalogImportService webCatalogImportService;

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats() {
        long markets = marketRepository.count();
        long users = userRepository.count();
        long products = productRepository.count();
        long observations = productObservationRepository.count();
        long enrichments = productEnrichmentRepository.count();
        return ResponseEntity.ok(Map.of(
            "markets", markets,
            "users", users,
            "products", products,
            "productObservations", observations,
            "productEnrichments", enrichments
        ));
    }

    @PostMapping("/catalog/backfill")
    public ResponseEntity<ProductCatalogBackfillResponse> backfillCatalog(
        @RequestParam(defaultValue = "500") int batchSize,
        @RequestParam(defaultValue = "20") int maxBatches
    ) {
        return ResponseEntity.ok(productCatalogService.backfillMissingCatalogData(batchSize, maxBatches));
    }

    @PostMapping("/catalog/enrichments")
    public ResponseEntity<Map<String, Object>> createEnrichment(
        @Valid @RequestBody ProductEnrichmentUpsertRequest request
    ) {
        ProductEnrichment enrichment = productCatalogService.upsertEnrichment(request);
        return ResponseEntity.ok(Map.of(
            "id", enrichment.getId(),
            "productId", enrichment.getProduct().getId(),
            "provider", enrichment.getProvider()
        ));
    }

    @PostMapping("/catalog/import/web")
    public ResponseEntity<CatalogWebImportResponseDTO> importCatalogFromWeb(
        @RequestParam(defaultValue = "25") int maxPagesPerSource,
        @RequestParam(defaultValue = "100") int pageSize
    ) {
        return ResponseEntity.ok(
            webCatalogImportService.importFromPublicSources(
                maxPagesPerSource,
                pageSize
            )
        );
    }

    @PostMapping("/catalog/import/records")
    public ResponseEntity<CatalogWebImportResponseDTO> importCatalogFromRecords(
        @Valid @RequestBody CatalogRecordsImportRequestDTO request
    ) {
        return ResponseEntity.ok(webCatalogImportService.importFromRecords(request));
    }

    @GetMapping("/catalog/products")
    public ResponseEntity<Page<CatalogAdminProductDTO>> listCatalogProducts(
        @RequestParam(required = false) String provider,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String brand,
        @RequestParam(required = false) String category,
        @RequestParam(required = false) String imageStatus,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size
    ) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.max(1, Math.min(size, 200));
        Pageable pageable = PageRequest.of(safePage, safeSize);
        return ResponseEntity.ok(productCatalogService.listCatalogProducts(provider, search, brand, category, imageStatus, pageable));
    }
}
