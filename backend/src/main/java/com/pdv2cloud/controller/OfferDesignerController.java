package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.OfferCatalogProductDTO;
import com.pdv2cloud.model.dto.OfferGenerationJobCreateRequest;
import com.pdv2cloud.model.dto.OfferGenerationJobDTO;
import com.pdv2cloud.model.dto.OfferOverviewDTO;
import com.pdv2cloud.model.dto.OfferTemplateDTO;
import com.pdv2cloud.model.dto.OfferTemplateUpsertRequest;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.OfferDesignerService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/markets/{marketId}/offers")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class OfferDesignerController {

    private final MarketAccessService marketAccessService;
    private final OfferDesignerService offerDesignerService;

    public OfferDesignerController(
        MarketAccessService marketAccessService,
        OfferDesignerService offerDesignerService
    ) {
        this.marketAccessService = marketAccessService;
        this.offerDesignerService = offerDesignerService;
    }

    @GetMapping("/overview")
    public ResponseEntity<OfferOverviewDTO> getOverview(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.getOverview(marketId));
    }

    @GetMapping("/catalog-search")
    public ResponseEntity<List<OfferCatalogProductDTO>> searchCatalog(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "20") int limit,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.searchCatalog(marketId, q, limit));
    }

    @GetMapping("/catalog-selection")
    public ResponseEntity<List<OfferCatalogProductDTO>> getCatalogSelection(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(name = "ids") List<UUID> ids,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.getCatalogSelection(marketId, ids));
    }

    @GetMapping("/templates")
    public ResponseEntity<List<OfferTemplateDTO>> listTemplates(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.listTemplates(marketId));
    }

    @GetMapping("/templates/{templateId}")
    public ResponseEntity<OfferTemplateDTO> getTemplate(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("templateId") UUID templateId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.getTemplate(marketId, templateId));
    }

    @PostMapping("/templates")
    public ResponseEntity<OfferTemplateDTO> createTemplate(
        @PathVariable("marketId") UUID marketId,
        @RequestBody OfferTemplateUpsertRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.createTemplate(marketId, request));
    }

    @PatchMapping("/templates/{templateId}")
    public ResponseEntity<OfferTemplateDTO> updateTemplate(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("templateId") UUID templateId,
        @RequestBody OfferTemplateUpsertRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.updateTemplate(marketId, templateId, request));
    }

    @GetMapping("/jobs")
    public ResponseEntity<List<OfferGenerationJobDTO>> listJobs(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.listJobs(marketId));
    }

    @PostMapping("/jobs")
    public ResponseEntity<OfferGenerationJobDTO> createJob(
        @PathVariable("marketId") UUID marketId,
        @RequestBody OfferGenerationJobCreateRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.createJob(marketId, request));
    }
}

