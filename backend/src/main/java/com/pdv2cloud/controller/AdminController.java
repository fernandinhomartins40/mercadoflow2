package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.ProductCatalogBackfillResponse;
import com.pdv2cloud.model.dto.ProductEnrichmentUpsertRequest;
import com.pdv2cloud.model.entity.ProductEnrichment;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductEnrichmentRepository;
import com.pdv2cloud.repository.ProductObservationRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.service.ProductCatalogService;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasRole('ADMIN')")
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
}
