package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.StatePriceComparisonStatsDTO;
import com.pdv2cloud.model.dto.StatePriceImportRequestDTO;
import com.pdv2cloud.model.dto.StatePriceImportResponseDTO;
import com.pdv2cloud.model.dto.StatePriceProductDetailDTO;
import com.pdv2cloud.model.dto.StatePriceProductSummaryDTO;
import com.pdv2cloud.model.dto.StatePriceSourceDTO;
import com.pdv2cloud.service.StatePriceService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/state-prices")
@PreAuthorize("hasAnyRole('ADMIN', 'SUPER_ADMIN')")
public class StatePriceController {

    @Autowired
    private StatePriceService statePriceService;

    @GetMapping("/stats")
    public ResponseEntity<StatePriceComparisonStatsDTO> getStats() {
        return ResponseEntity.ok(statePriceService.getStats());
    }

    @GetMapping("/sources")
    public ResponseEntity<List<StatePriceSourceDTO>> listSources() {
        return ResponseEntity.ok(statePriceService.listSources());
    }

    @GetMapping("/states")
    public ResponseEntity<List<String>> listStates() {
        return ResponseEntity.ok(statePriceService.listStates());
    }

    @GetMapping("/products")
    public ResponseEntity<Page<StatePriceProductSummaryDTO>> searchProducts(
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String state,
        @RequestParam(required = false) String provider,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.max(1, Math.min(size, 100)));
        return ResponseEntity.ok(statePriceService.searchProducts(search, state, provider, pageable));
    }

    @GetMapping("/products/{productId}")
    public ResponseEntity<StatePriceProductDetailDTO> getProductDetail(@PathVariable UUID productId) {
        return ResponseEntity.ok(statePriceService.getProductDetail(productId));
    }

    @PostMapping("/import")
    public ResponseEntity<StatePriceImportResponseDTO> importObservations(
        @Valid @RequestBody StatePriceImportRequestDTO request
    ) {
        return ResponseEntity.ok(statePriceService.importObservations(request));
    }
}
