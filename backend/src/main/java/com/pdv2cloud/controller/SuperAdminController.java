package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.CatalogAdminProductDTO;
import com.pdv2cloud.model.dto.SuperAdminCatalogProductUpsertRequest;
import com.pdv2cloud.model.dto.SuperAdminCrawlerConfigDTO;
import com.pdv2cloud.model.dto.SuperAdminMarketCreateRequest;
import com.pdv2cloud.model.dto.SuperAdminMarketDTO;
import com.pdv2cloud.model.dto.SuperAdminMarketUpdateRequest;
import com.pdv2cloud.model.dto.SuperAdminOverviewDTO;
import com.pdv2cloud.model.dto.SuperAdminUserCreateRequest;
import com.pdv2cloud.model.dto.SuperAdminUserDTO;
import com.pdv2cloud.model.dto.SuperAdminUserRoleUpdateRequest;
import com.pdv2cloud.model.dto.SuperAdminUserStatusRequest;
import com.pdv2cloud.service.ProductCatalogService;
import com.pdv2cloud.service.SuperAdminService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/super-admin")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SuperAdminController {

    @Autowired
    private SuperAdminService superAdminService;

    @Autowired
    private ProductCatalogService productCatalogService;

    @GetMapping("/overview")
    public ResponseEntity<SuperAdminOverviewDTO> overview() {
        return ResponseEntity.ok(superAdminService.getOverview());
    }

    @GetMapping("/users")
    public ResponseEntity<Page<SuperAdminUserDTO>> listUsers(
        @RequestParam(required = false) String search,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "30") int size
    ) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.max(1, Math.min(size, 200)));
        return ResponseEntity.ok(superAdminService.listUsers(search, pageable));
    }

    @PostMapping("/users")
    public ResponseEntity<SuperAdminUserDTO> createUser(@Valid @RequestBody SuperAdminUserCreateRequest request) {
        return ResponseEntity.ok(superAdminService.createUser(request));
    }

    @PatchMapping("/users/{userId}/status")
    public ResponseEntity<SuperAdminUserDTO> updateUserStatus(
        @PathVariable UUID userId,
        @Valid @RequestBody SuperAdminUserStatusRequest request
    ) {
        return ResponseEntity.ok(superAdminService.updateUserStatus(userId, request));
    }

    @PatchMapping("/users/{userId}/role")
    public ResponseEntity<SuperAdminUserDTO> updateUserRole(
        @PathVariable UUID userId,
        @Valid @RequestBody SuperAdminUserRoleUpdateRequest request
    ) {
        return ResponseEntity.ok(superAdminService.updateUserRole(userId, request));
    }

    @GetMapping("/markets")
    public ResponseEntity<Page<SuperAdminMarketDTO>> listMarkets(
        @RequestParam(required = false) String search,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "30") int size
    ) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.max(1, Math.min(size, 200)));
        return ResponseEntity.ok(superAdminService.listMarkets(search, pageable));
    }

    @PostMapping("/markets")
    public ResponseEntity<SuperAdminMarketDTO> createMarket(@Valid @RequestBody SuperAdminMarketCreateRequest request) {
        return ResponseEntity.ok(superAdminService.createMarket(request));
    }

    @PatchMapping("/markets/{marketId}")
    public ResponseEntity<SuperAdminMarketDTO> updateMarket(
        @PathVariable UUID marketId,
        @Valid @RequestBody SuperAdminMarketUpdateRequest request
    ) {
        return ResponseEntity.ok(superAdminService.updateMarket(marketId, request));
    }

    @GetMapping("/catalog/products")
    public ResponseEntity<Page<CatalogAdminProductDTO>> listCatalogProducts(
        @RequestParam(required = false) String provider,
        @RequestParam(required = false) String search,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size
    ) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.max(1, Math.min(size, 200)));
        return ResponseEntity.ok(productCatalogService.listCatalogProducts(provider, search, pageable));
    }

    @PostMapping("/catalog/products")
    public ResponseEntity<CatalogAdminProductDTO> upsertCatalogProduct(
        @Valid @RequestBody SuperAdminCatalogProductUpsertRequest request
    ) {
        return ResponseEntity.ok(superAdminService.upsertCatalogProduct(request));
    }

    @PutMapping("/catalog/products/{productId}")
    public ResponseEntity<CatalogAdminProductDTO> updateCatalogProduct(
        @PathVariable UUID productId,
        @Valid @RequestBody SuperAdminCatalogProductUpsertRequest request
    ) {
        return ResponseEntity.ok(superAdminService.updateCatalogProduct(productId, request));
    }

    @GetMapping("/catalog/crawler/config")
    public ResponseEntity<SuperAdminCrawlerConfigDTO> getCrawlerConfig() {
        return ResponseEntity.ok(superAdminService.getCrawlerConfig(false));
    }

    @PutMapping("/catalog/crawler/config")
    public ResponseEntity<SuperAdminCrawlerConfigDTO> saveCrawlerConfig(
        @Valid @RequestBody SuperAdminCrawlerConfigDTO request
    ) {
        return ResponseEntity.ok(superAdminService.saveCrawlerConfig(request));
    }

    @GetMapping("/catalog/crawler/export-config")
    public ResponseEntity<SuperAdminCrawlerConfigDTO> exportCrawlerConfig() {
        return ResponseEntity.ok(superAdminService.getCrawlerConfig(true));
    }
}
