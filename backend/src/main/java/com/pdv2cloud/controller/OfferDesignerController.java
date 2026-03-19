package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.OfferCatalogProductDTO;
import com.pdv2cloud.model.dto.OfferBrandKitDTO;
import com.pdv2cloud.model.dto.OfferBrandKitUpsertRequest;
import com.pdv2cloud.model.dto.OfferBackgroundRemovalDTO;
import com.pdv2cloud.model.dto.OfferBackgroundRemovalRequest;
import com.pdv2cloud.model.dto.OfferCampaignKitDTO;
import com.pdv2cloud.model.dto.OfferCampaignKitUpsertRequest;
import com.pdv2cloud.model.dto.OfferGenerationJobCreateRequest;
import com.pdv2cloud.model.dto.OfferGenerationJobDTO;
import com.pdv2cloud.model.dto.OfferOverviewDTO;
import com.pdv2cloud.model.dto.OfferPublishRequest;
import com.pdv2cloud.model.dto.OfferRenderOutputDTO;
import com.pdv2cloud.model.dto.OfferTemplateDTO;
import com.pdv2cloud.model.dto.OfferTemplatePreviewDTO;
import com.pdv2cloud.model.dto.OfferTemplatePreviewRequest;
import com.pdv2cloud.model.dto.OfferTemplateValidationDTO;
import com.pdv2cloud.model.dto.OfferTemplateVariantDTO;
import com.pdv2cloud.model.dto.OfferTemplateVariantUpsertRequest;
import com.pdv2cloud.model.dto.OfferTemplateUpsertRequest;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.OfferDesignerService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
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

    @GetMapping("/templates/{templateId}/variants")
    public ResponseEntity<List<OfferTemplateVariantDTO>> listTemplateVariants(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("templateId") UUID templateId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.listTemplateVariants(marketId, templateId));
    }

    @PostMapping("/templates/{templateId}/variants")
    public ResponseEntity<OfferTemplateVariantDTO> createTemplateVariant(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("templateId") UUID templateId,
        @RequestBody OfferTemplateVariantUpsertRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.createTemplateVariant(marketId, templateId, request));
    }

    @PatchMapping("/variants/{variantId}")
    public ResponseEntity<OfferTemplateVariantDTO> updateTemplateVariant(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("variantId") UUID variantId,
        @RequestBody OfferTemplateVariantUpsertRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.updateTemplateVariant(marketId, variantId, request));
    }

    @GetMapping("/templates/{templateId}/validate")
    public ResponseEntity<OfferTemplateValidationDTO> validateTemplate(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("templateId") UUID templateId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.validateTemplate(marketId, templateId));
    }

    @PostMapping("/preview")
    public ResponseEntity<OfferTemplatePreviewDTO> previewTemplate(
        @PathVariable("marketId") UUID marketId,
        @RequestBody OfferTemplatePreviewRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.previewTemplate(marketId, request));
    }

    @PostMapping("/auto-fill")
    public ResponseEntity<OfferTemplatePreviewDTO> autoFillTemplate(
        @PathVariable("marketId") UUID marketId,
        @RequestBody OfferTemplatePreviewRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.autoFillTemplate(marketId, request));
    }

    @PostMapping("/remove-background")
    public ResponseEntity<OfferBackgroundRemovalDTO> removeBackground(
        @PathVariable("marketId") UUID marketId,
        @RequestBody OfferBackgroundRemovalRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.removeBackground(marketId, request));
    }

    @GetMapping("/brand-kits")
    public ResponseEntity<List<OfferBrandKitDTO>> listBrandKits(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.listBrandKits(marketId));
    }

    @PostMapping("/brand-kits")
    public ResponseEntity<OfferBrandKitDTO> createBrandKit(
        @PathVariable("marketId") UUID marketId,
        @RequestBody OfferBrandKitUpsertRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.createBrandKit(marketId, request));
    }

    @PatchMapping("/brand-kits/{kitId}")
    public ResponseEntity<OfferBrandKitDTO> updateBrandKit(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("kitId") UUID kitId,
        @RequestBody OfferBrandKitUpsertRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.updateBrandKit(marketId, kitId, request));
    }

    @GetMapping("/campaign-kits")
    public ResponseEntity<List<OfferCampaignKitDTO>> listCampaignKits(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.listCampaignKits(marketId));
    }

    @PostMapping("/campaign-kits")
    public ResponseEntity<OfferCampaignKitDTO> createCampaignKit(
        @PathVariable("marketId") UUID marketId,
        @RequestBody OfferCampaignKitUpsertRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.createCampaignKit(marketId, request));
    }

    @PatchMapping("/campaign-kits/{kitId}")
    public ResponseEntity<OfferCampaignKitDTO> updateCampaignKit(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("kitId") UUID kitId,
        @RequestBody OfferCampaignKitUpsertRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.updateCampaignKit(marketId, kitId, request));
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

    @GetMapping("/jobs/{jobId}")
    public ResponseEntity<OfferGenerationJobDTO> getJob(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("jobId") UUID jobId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.getJob(marketId, jobId));
    }

    @PatchMapping("/jobs/{jobId}")
    public ResponseEntity<OfferGenerationJobDTO> updateJob(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("jobId") UUID jobId,
        @RequestBody OfferGenerationJobCreateRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.updateJob(marketId, jobId, request));
    }

    @PostMapping("/jobs/{jobId}/clone")
    public ResponseEntity<OfferGenerationJobDTO> cloneJob(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("jobId") UUID jobId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.cloneJob(marketId, jobId));
    }

    @DeleteMapping("/jobs/{jobId}")
    public ResponseEntity<Void> deleteJob(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("jobId") UUID jobId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        offerDesignerService.deleteJob(marketId, jobId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/jobs/{jobId}/outputs")
    public ResponseEntity<List<OfferRenderOutputDTO>> listOutputs(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("jobId") UUID jobId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.listOutputs(marketId, jobId));
    }

    @PostMapping("/jobs/{jobId}/publish")
    public ResponseEntity<List<OfferRenderOutputDTO>> publishJob(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("jobId") UUID jobId,
        @RequestBody OfferPublishRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(offerDesignerService.publishJob(marketId, jobId, request));
    }
}

