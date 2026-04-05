package com.pdv2cloud.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.MarketCockpitDTO;
import com.pdv2cloud.model.dto.OfferBrandKitDTO;
import com.pdv2cloud.model.dto.OfferBrandKitUpsertRequest;
import com.pdv2cloud.model.dto.OfferAssetUploadDTO;
import com.pdv2cloud.model.dto.OfferBackgroundRemovalDTO;
import com.pdv2cloud.model.dto.OfferBackgroundRemovalRequest;
import com.pdv2cloud.model.dto.OfferCampaignKitDTO;
import com.pdv2cloud.model.dto.OfferCampaignKitUpsertRequest;
import com.pdv2cloud.model.dto.OfferCatalogProductDTO;
import com.pdv2cloud.model.dto.OfferGenerationJobCreateRequest;
import com.pdv2cloud.model.dto.OfferGenerationJobDTO;
import com.pdv2cloud.model.dto.OfferGenerationJobItemDTO;
import com.pdv2cloud.model.dto.OfferMarketProfileDTO;
import com.pdv2cloud.model.dto.OfferMarketProfileUpsertRequest;
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
import com.pdv2cloud.model.dto.ProductPerformanceDTO;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.OfferBrandKit;
import com.pdv2cloud.model.entity.OfferCampaignKit;
import com.pdv2cloud.model.entity.OfferGenerationJob;
import com.pdv2cloud.model.entity.OfferGenerationJobItem;
import com.pdv2cloud.model.entity.OfferMarketProfile;
import com.pdv2cloud.model.entity.OfferRenderOutput;
import com.pdv2cloud.model.entity.OfferTemplate;
import com.pdv2cloud.model.entity.OfferTemplateVariant;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.OfferBrandKitRepository;
import com.pdv2cloud.repository.OfferCampaignKitRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.OfferGenerationJobItemRepository;
import com.pdv2cloud.repository.OfferGenerationJobRepository;
import com.pdv2cloud.repository.OfferMarketProfileRepository;
import com.pdv2cloud.repository.OfferRenderOutputRepository;
import com.pdv2cloud.repository.OfferTemplateRepository;
import com.pdv2cloud.repository.OfferTemplateVariantRepository;
import com.pdv2cloud.repository.ProductRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class OfferDesignerService {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final OfferTemplateRepository offerTemplateRepository;
    private final OfferTemplateVariantRepository offerTemplateVariantRepository;
    private final OfferGenerationJobRepository offerGenerationJobRepository;
    private final OfferGenerationJobItemRepository offerGenerationJobItemRepository;
    private final OfferRenderOutputRepository offerRenderOutputRepository;
    private final OfferBrandKitRepository offerBrandKitRepository;
    private final OfferCampaignKitRepository offerCampaignKitRepository;
    private final OfferMarketProfileRepository offerMarketProfileRepository;
    private final MarketRepository marketRepository;
    private final ProductRepository productRepository;
    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final CatalogImageStorageService catalogImageStorageService;
    private final OfferBackgroundRemovalService offerBackgroundRemovalService;
    private final OfferAssetStorageService offerAssetStorageService;
    private final OfferRenderEngineService offerRenderEngineService;
    private final AdvancedAnalyticsService advancedAnalyticsService;
    private final ObjectMapper objectMapper;

    public OfferDesignerService(
        OfferTemplateRepository offerTemplateRepository,
        OfferTemplateVariantRepository offerTemplateVariantRepository,
        OfferGenerationJobRepository offerGenerationJobRepository,
        OfferGenerationJobItemRepository offerGenerationJobItemRepository,
        OfferRenderOutputRepository offerRenderOutputRepository,
        OfferBrandKitRepository offerBrandKitRepository,
        OfferCampaignKitRepository offerCampaignKitRepository,
        OfferMarketProfileRepository offerMarketProfileRepository,
        MarketRepository marketRepository,
        ProductRepository productRepository,
        NamedParameterJdbcTemplate jdbcTemplate,
        CatalogImageStorageService catalogImageStorageService,
        OfferBackgroundRemovalService offerBackgroundRemovalService,
        OfferAssetStorageService offerAssetStorageService,
        OfferRenderEngineService offerRenderEngineService,
        AdvancedAnalyticsService advancedAnalyticsService,
        ObjectMapper objectMapper
    ) {
        this.offerTemplateRepository = offerTemplateRepository;
        this.offerTemplateVariantRepository = offerTemplateVariantRepository;
        this.offerGenerationJobRepository = offerGenerationJobRepository;
        this.offerGenerationJobItemRepository = offerGenerationJobItemRepository;
        this.offerRenderOutputRepository = offerRenderOutputRepository;
        this.offerBrandKitRepository = offerBrandKitRepository;
        this.offerCampaignKitRepository = offerCampaignKitRepository;
        this.offerMarketProfileRepository = offerMarketProfileRepository;
        this.marketRepository = marketRepository;
        this.productRepository = productRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.catalogImageStorageService = catalogImageStorageService;
        this.offerBackgroundRemovalService = offerBackgroundRemovalService;
        this.offerAssetStorageService = offerAssetStorageService;
        this.offerRenderEngineService = offerRenderEngineService;
        this.advancedAnalyticsService = advancedAnalyticsService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public OfferOverviewDTO getOverview(UUID marketId) {
        ensureStarterData(marketId);
        MarketCockpitDTO cockpit = advancedAnalyticsService.getCockpit(marketId, null, null);
        List<OfferTemplateDTO> templates = listTemplates(marketId);
        List<OfferGenerationJobDTO> recentJobs = listJobs(marketId);
        List<OfferBrandKitDTO> brandKits = listBrandKits(marketId);
        List<OfferCampaignKitDTO> campaignKits = listCampaignKits(marketId);
        OfferMarketProfileDTO marketProfile = toMarketProfileDto(ensureStarterMarketProfile(marketId));

        List<ProductPerformanceDTO> seasonalSuggestions = List.of();
        if (cockpit.getSeasonalCollections() != null && !cockpit.getSeasonalCollections().isEmpty()) {
            seasonalSuggestions = cockpit.getSeasonalCollections().get(0).getProducts().stream()
                .limit(8)
                .toList();
        }

        return new OfferOverviewDTO(
            templates.size(),
            offerGenerationJobRepository.countByMarket_Id(marketId),
            offerGenerationJobRepository.countByMarket_IdAndStatusIn(marketId, List.of("DRAFT", "QUEUED", "PROCESSING")),
            templates,
            recentJobs.stream().limit(8).toList(),
            brandKits,
            campaignKits,
            marketProfile,
            cockpit.getReplenishmentCandidates() != null ? cockpit.getReplenishmentCandidates().stream().limit(8).toList() : List.of(),
            seasonalSuggestions,
            cockpit.getPromotionHighlights() != null ? cockpit.getPromotionHighlights().stream().limit(8).toList() : List.of(),
            cockpit.getTopPairs() != null ? cockpit.getTopPairs().stream().limit(8).toList() : List.of()
        );
    }

    @Transactional(readOnly = true)
    public OfferMarketProfileDTO getMarketProfile(UUID marketId) {
        ensureStarterData(marketId);
        return toMarketProfileDto(ensureStarterMarketProfile(marketId));
    }

    @Transactional
    public OfferMarketProfileDTO updateMarketProfile(UUID marketId, OfferMarketProfileUpsertRequest request) {
        OfferMarketProfile profile = ensureStarterMarketProfile(marketId);
        applyMarketProfileRequest(profile, request);
        return toMarketProfileDto(offerMarketProfileRepository.save(profile));
    }

    @Transactional
    public OfferAssetUploadDTO uploadMarketProfileLogo(UUID marketId, String slot, MultipartFile file) {
        OfferMarketProfile profile = ensureStarterMarketProfile(marketId);
        String normalizedSlot = normalizeText(slot, "PRIMARY");
        boolean secondary = "SECONDARY".equalsIgnoreCase(normalizedSlot) || "RIGHT".equalsIgnoreCase(normalizedSlot);
        OfferAssetStorageService.StoredAsset storedAsset = offerAssetStorageService.storeUploadedAsset(
            marketId,
            secondary ? "market-profile-secondary-logo" : "market-profile-primary-logo",
            file,
            1400,
            1400
        );
        if (secondary) {
            profile.setSecondaryLogoUrl(storedAsset.assetUrl());
            profile.setSecondaryLogoStorageKey(storedAsset.storageKey());
        } else {
            profile.setPrimaryLogoUrl(storedAsset.assetUrl());
            profile.setPrimaryLogoStorageKey(storedAsset.storageKey());
        }
        offerMarketProfileRepository.save(profile);
        return toAssetUploadDto(storedAsset);
    }

    @Transactional
    public OfferAssetUploadDTO uploadTemplateAsset(UUID marketId, String purpose, MultipartFile file) {
        String normalizedPurpose = normalizeText(purpose, "template-asset").toLowerCase(Locale.ROOT);
        int maxWidth = normalizedPurpose.contains("background") ? 3200 : 1800;
        int maxHeight = normalizedPurpose.contains("background") ? 4800 : 1800;
        OfferAssetStorageService.StoredAsset storedAsset = offerAssetStorageService.storeUploadedAsset(
            marketId,
            "template-" + slugify(normalizedPurpose),
            file,
            maxWidth,
            maxHeight
        );
        return toAssetUploadDto(storedAsset);
    }

    @Transactional
    public List<OfferTemplateDTO> listTemplates(UUID marketId) {
        ensureStarterData(marketId);
        return offerTemplateRepository.findByMarket_IdOrderByIsSystemTemplateDescUpdatedAtDesc(marketId).stream()
            .map(this::toTemplateDto)
            .toList();
    }

    @Transactional
    public OfferTemplateDTO getTemplate(UUID marketId, UUID templateId) {
        ensureStarterData(marketId);
        return offerTemplateRepository.findByIdAndMarket_Id(templateId, marketId)
            .map(this::toTemplateDto)
            .orElseThrow(() -> new IllegalArgumentException("Template não encontrado"));
    }

    @Transactional
    public OfferTemplateDTO createTemplate(UUID marketId, OfferTemplateUpsertRequest request) {
        Market market = findMarket(marketId);
        OfferTemplate template = new OfferTemplate();
        template.setMarket(market);
        template.setTemplateKey(null);
        applyTemplateRequest(template, request, false);
        OfferTemplate saved = offerTemplateRepository.save(template);
        ensureDefaultVariant(saved);
        return toTemplateDto(saved);
    }

    @Transactional
    public OfferTemplateDTO updateTemplate(UUID marketId, UUID templateId, OfferTemplateUpsertRequest request) {
        OfferTemplate template = offerTemplateRepository.findByIdAndMarket_Id(templateId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Template não encontrado"));
        applyTemplateRequest(template, request, Boolean.TRUE.equals(template.getIsSystemTemplate()));
        OfferTemplate saved = offerTemplateRepository.save(template);
        ensureDefaultVariant(saved);
        return toTemplateDto(saved);
    }

    @Transactional(readOnly = true)
    public List<OfferBrandKitDTO> listBrandKits(UUID marketId) {
        ensureStarterData(marketId);
        return offerBrandKitRepository.findByMarket_IdOrderByIsSystemKitDescUpdatedAtDesc(marketId).stream()
            .map(this::toBrandKitDto)
            .toList();
    }

    @Transactional
    public OfferBrandKitDTO createBrandKit(UUID marketId, OfferBrandKitUpsertRequest request) {
        OfferBrandKit kit = new OfferBrandKit();
        kit.setMarket(findMarket(marketId));
        applyBrandKitRequest(kit, request, false);
        return toBrandKitDto(offerBrandKitRepository.save(kit));
    }

    @Transactional
    public OfferBrandKitDTO updateBrandKit(UUID marketId, UUID kitId, OfferBrandKitUpsertRequest request) {
        OfferBrandKit kit = offerBrandKitRepository.findByIdAndMarket_Id(kitId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Brand kit nao encontrado"));
        applyBrandKitRequest(kit, request, Boolean.TRUE.equals(kit.getIsSystemKit()));
        return toBrandKitDto(offerBrandKitRepository.save(kit));
    }

    @Transactional(readOnly = true)
    public List<OfferCampaignKitDTO> listCampaignKits(UUID marketId) {
        ensureStarterData(marketId);
        return offerCampaignKitRepository.findByMarket_IdOrderByIsSystemKitDescUpdatedAtDesc(marketId).stream()
            .map(this::toCampaignKitDto)
            .toList();
    }

    @Transactional
    public OfferCampaignKitDTO createCampaignKit(UUID marketId, OfferCampaignKitUpsertRequest request) {
        OfferCampaignKit kit = new OfferCampaignKit();
        kit.setMarket(findMarket(marketId));
        applyCampaignKitRequest(kit, request, false);
        return toCampaignKitDto(offerCampaignKitRepository.save(kit));
    }

    @Transactional
    public OfferCampaignKitDTO updateCampaignKit(UUID marketId, UUID kitId, OfferCampaignKitUpsertRequest request) {
        OfferCampaignKit kit = offerCampaignKitRepository.findByIdAndMarket_Id(kitId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Campaign kit nao encontrado"));
        applyCampaignKitRequest(kit, request, Boolean.TRUE.equals(kit.getIsSystemKit()));
        return toCampaignKitDto(offerCampaignKitRepository.save(kit));
    }

    @Transactional(readOnly = true)
    public List<OfferTemplateVariantDTO> listTemplateVariants(UUID marketId, UUID templateId) {
        offerTemplateRepository.findByIdAndMarket_Id(templateId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Template nao encontrado"));
        return offerTemplateVariantRepository.findByTemplate_IdOrderByCreatedAtAsc(templateId).stream()
            .map(this::toVariantDto)
            .toList();
    }

    @Transactional
    public OfferTemplateVariantDTO createTemplateVariant(UUID marketId, UUID templateId, OfferTemplateVariantUpsertRequest request) {
        OfferTemplate template = offerTemplateRepository.findByIdAndMarket_Id(templateId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Template nao encontrado"));
        OfferTemplateVariant variant = new OfferTemplateVariant();
        variant.setTemplate(template);
        applyVariantRequest(variant, request);
        OfferTemplateVariant saved = offerTemplateVariantRepository.save(variant);
        if (template.getDefaultVariantKey() == null || template.getDefaultVariantKey().isBlank()) {
            template.setDefaultVariantKey(saved.getVariantKey());
            offerTemplateRepository.save(template);
        }
        return toVariantDto(saved);
    }

    @Transactional
    public OfferTemplateVariantDTO updateTemplateVariant(UUID marketId, UUID variantId, OfferTemplateVariantUpsertRequest request) {
        OfferTemplateVariant variant = offerTemplateVariantRepository.findByIdAndTemplate_Market_Id(variantId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Variant nao encontrada"));
        applyVariantRequest(variant, request);
        return toVariantDto(offerTemplateVariantRepository.save(variant));
    }

    @Transactional(readOnly = true)
    public OfferTemplateValidationDTO validateTemplate(UUID marketId, UUID templateId) {
        OfferTemplate template = offerTemplateRepository.findByIdAndMarket_Id(templateId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Template nao encontrado"));
        Map<String, Object> schema = normalizeSchema(template);
        List<Map<String, Object>> layers = listOfMaps(schema.get("layers"));
        List<Map<String, Object>> zones = listOfMaps(schema.get("productZones"));
        int variantCount = offerTemplateVariantRepository.findByTemplate_IdOrderByCreatedAtAsc(templateId).size();
        List<String> messages = new ArrayList<>();
        if (layers.isEmpty()) {
            messages.add("Template sem camadas definidas.");
        }
        if (zones.isEmpty()) {
            messages.add("Template sem zonas de produto.");
        }
        if (variantCount == 0) {
            messages.add("Template sem variantes.");
        }
        return new OfferTemplateValidationDTO(messages.isEmpty(), layers.size(), zones.size(), variantCount, messages);
    }

    @Transactional(readOnly = true)
    public OfferTemplatePreviewDTO previewTemplate(UUID marketId, OfferTemplatePreviewRequest request) {
        OfferTemplate template = offerTemplateRepository.findByIdAndMarket_Id(request.getTemplateId(), marketId)
            .orElseThrow(() -> new IllegalArgumentException("Template nao encontrado"));
        List<OfferCatalogProductDTO> products = request.getProductIds() == null || request.getProductIds().isEmpty()
            ? List.of()
            : getCatalogSelection(marketId, request.getProductIds());
        OfferTemplateVariant variant = resolveVariant(template, request.getVariantKey());
        OfferBrandKit brandKit = resolveBrandKit(marketId, template, request.getBrandKitId());
        OfferCampaignKit campaignKit = resolveCampaignKit(marketId, template, request.getCampaignKitId());
        OfferMarketProfile marketProfile = ensureStarterMarketProfile(marketId);
        Map<String, Object> renderOptions = parseJsonObject(request.getRenderOptionsJson());
        Map<String, Object> resolved = buildResolvedDesign(template, variant, brandKit, campaignKit, marketProfile, products, renderOptions);
        return new OfferTemplatePreviewDTO(
            template.getId(),
            template.getName(),
            variant != null ? variant.getVariantKey() : template.getDefaultVariantKey(),
            variant != null ? variant.getCanvasWidth() : template.getCanvasWidth(),
            variant != null ? variant.getCanvasHeight() : template.getCanvasHeight(),
            writeJson(resolved),
            products.stream().map(OfferCatalogProductDTO::getProductId).filter(Objects::nonNull).toList(),
            List.of()
        );
    }

    @Transactional(readOnly = true)
    public OfferTemplatePreviewDTO autoFillTemplate(UUID marketId, OfferTemplatePreviewRequest request) {
        return previewTemplate(marketId, request);
    }

    @Transactional
    public OfferBackgroundRemovalDTO removeBackground(UUID marketId, OfferBackgroundRemovalRequest request) {
        return offerBackgroundRemovalService.removeBackground(marketId, request);
    }

    @Transactional(readOnly = true)
    public List<OfferRenderOutputDTO> listOutputs(UUID marketId, UUID jobId) {
        offerGenerationJobRepository.findByIdAndMarket_Id(jobId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Lote nao encontrado"));
        return offerRenderOutputRepository.findByJob_IdOrderByCreatedAtDesc(jobId).stream()
            .map(this::toRenderOutputDto)
            .toList();
    }

    @Transactional
    public List<OfferRenderOutputDTO> publishJob(UUID marketId, UUID jobId, OfferPublishRequest request) {
        OfferGenerationJob job = offerGenerationJobRepository.findByIdAndMarket_Id(jobId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Lote nao encontrado"));
        OfferTemplate template = job.getTemplate() != null
            ? offerTemplateRepository.findByIdAndMarket_Id(job.getTemplate().getId(), marketId).orElse(job.getTemplate())
            : null;
        if (template == null) {
            throw new IllegalArgumentException("Template do lote nao encontrado");
        }

        Map<String, Object> renderOptions = parseJsonObject(normalizeText(request.getRenderOptionsJson(), job.getRenderOptionsJson()));
        UUID selectedBrandKitId = uuidFromText((String) renderOptions.get("brandKitId"));
        UUID selectedCampaignKitId = uuidFromText((String) renderOptions.get("campaignKitId"));
        List<OfferCatalogProductDTO> products = buildJobProducts(job.getId());
        OfferMarketProfile marketProfile = ensureStarterMarketProfile(marketId);
        List<String> variantKeys = nonEmptyList(request.getVariantKeys(), List.of(normalizeText(job.getVariantKey(), "default")));
        List<String> outputTypes = nonEmptyList(request.getOutputTypes(), List.of(normalizeText(job.getOutputType(), "PNG")));
        List<String> publishTargets = nonEmptyList(request.getPublishTargets(), List.of("DOWNLOAD"));
        List<OfferRenderOutputDTO> created = new ArrayList<>();
        job.setStatus("PROCESSING");
        offerGenerationJobRepository.save(job);
        for (String variantKey : variantKeys) {
            OfferTemplateVariant variant = resolveVariant(template, variantKey);
            OfferBrandKit brandKit = resolveBrandKit(marketId, template, selectedBrandKitId);
            OfferCampaignKit campaignKit = resolveCampaignKit(marketId, template, selectedCampaignKitId);
            String resolvedDesignJson = writeJson(buildResolvedDesign(template, variant, brandKit, campaignKit, marketProfile, products, renderOptions));
            for (String outputType : outputTypes) {
                for (String publishTarget : publishTargets) {
                    OfferRenderOutput output = new OfferRenderOutput();
                    output.setMarket(job.getMarket());
                    output.setJob(job);
                    output.setTemplate(job.getTemplate());
                    output.setVariantKey(normalizeText(variantKey, job.getVariantKey()));
                    output.setOutputType(normalizeText(outputType, "PNG"));
                    output.setPublishTarget(normalizeText(publishTarget, "DOWNLOAD"));
                    output.setStatus("QUEUED");
                    output.setRenderOptionsJson(normalizeText(request.getRenderOptionsJson(), job.getRenderOptionsJson()));
                    OfferRenderOutput saved = offerRenderOutputRepository.save(output);
                    try {
                        OfferRenderEngineService.RenderedOutput renderedOutput = offerRenderEngineService.render(job, saved, resolvedDesignJson);
                        saved.setStatus("READY");
                        saved.setFileUrl(renderedOutput.fileUrl());
                        saved.setPreviewImageUrl(renderedOutput.previewImageUrl());
                        saved.setErrorMessage(null);
                    } catch (Exception ex) {
                        saved.setStatus("FAILED");
                        saved.setErrorMessage(normalizeText(ex.getMessage(), "Falha ao renderizar output"));
                    }
                    created.add(toRenderOutputDto(offerRenderOutputRepository.save(saved)));
                }
            }
        }
        long readyCount = created.stream().filter(output -> "READY".equalsIgnoreCase(output.getStatus())).count();
        long failedCount = created.stream().filter(output -> "FAILED".equalsIgnoreCase(output.getStatus())).count();
        if (readyCount > 0 && failedCount > 0) {
            job.setStatus("PARTIAL");
        } else if (readyCount > 0) {
            job.setStatus("READY");
        } else if (failedCount > 0) {
            job.setStatus("FAILED");
        } else {
            job.setStatus("QUEUED");
        }
        offerGenerationJobRepository.save(job);
        return created;
    }

    @Transactional(readOnly = true)
    public List<OfferCatalogProductDTO> searchCatalog(UUID marketId, String query, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 30));
        String searchPattern = query == null || query.isBlank() ? "" : "%" + query.trim().toLowerCase(Locale.ROOT) + "%";

        String sql = """
            with latest_enrichment as (
                select distinct on (pe.product_id)
                    pe.product_id,
                    pe.brand,
                    pe.category,
                    pe.unit,
                    pe.package_description,
                    pe.image_url,
                    pe.image_storage_key
                from product_enrichments pe
                order by pe.product_id, pe.fetched_at desc, pe.id desc
            ),
            recent_sales as (
                select
                    it.product_id,
                    round(avg(it.valor_unitario)::numeric, 2) as current_price,
                    round(avg(it.valor_unitario)::numeric, 2) as baseline_price,
                    max(i.data_emissao) as last_sold_at
                from invoice_items it
                join invoices i on i.id = it.invoice_id
                where i.market_id = :marketId
                  and i.data_emissao >= :salesStart
                group by it.product_id
            )
            select
                p.id as product_id,
                p.ean,
                p.name,
                coalesce(le.brand, p.brand, '') as brand,
                coalesce(le.category, p.category, '') as category,
                coalesce(le.unit, p.unit, '') as unit,
                coalesce(le.package_description, p.package_description, '') as package_description,
                coalesce(le.image_storage_key, le.image_url, p.image_url) as image_ref,
                coalesce(rs.current_price, 0) as current_price,
                coalesce(rs.baseline_price, 0) as baseline_price,
                rs.last_sold_at
            from products p
            left join latest_enrichment le on le.product_id = p.id
            left join recent_sales rs on rs.product_id = p.id
            where (
                :searchPattern = ''
                or lower(coalesce(p.name, '')) like :searchPattern
                or lower(coalesce(p.ean, '')) like :searchPattern
                or lower(coalesce(le.brand, p.brand, '')) like :searchPattern
                or lower(coalesce(le.category, p.category, '')) like :searchPattern
            )
            order by
                case when lower(coalesce(p.ean, '')) = replace(:exactSearch, ' ', '') then 0 else 1 end,
                rs.last_sold_at desc nulls last,
                p.name asc
            limit :limit
            """;

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("salesStart", Timestamp.valueOf(LocalDateTime.now().minusDays(90)))
            .addValue("searchPattern", searchPattern)
            .addValue("exactSearch", query == null ? "" : query.trim().toLowerCase(Locale.ROOT))
            .addValue("limit", safeLimit);

        return jdbcTemplate.query(sql, params, (rs, rowNum) -> mapCatalogProduct(rs));
    }

    @Transactional(readOnly = true)
    public List<OfferCatalogProductDTO> getCatalogSelection(UUID marketId, List<UUID> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            return List.of();
        }
        String sql = """
            with latest_enrichment as (
                select distinct on (pe.product_id)
                    pe.product_id,
                    pe.brand,
                    pe.category,
                    pe.unit,
                    pe.package_description,
                    pe.image_url,
                    pe.image_storage_key
                from product_enrichments pe
                order by pe.product_id, pe.fetched_at desc, pe.id desc
            ),
            recent_sales as (
                select
                    it.product_id,
                    round(avg(it.valor_unitario)::numeric, 2) as current_price,
                    round(avg(it.valor_unitario)::numeric, 2) as baseline_price,
                    max(i.data_emissao) as last_sold_at
                from invoice_items it
                join invoices i on i.id = it.invoice_id
                where i.market_id = :marketId
                  and i.data_emissao >= :salesStart
                group by it.product_id
            )
            select
                p.id as product_id,
                p.ean,
                p.name,
                coalesce(le.brand, p.brand, '') as brand,
                coalesce(le.category, p.category, '') as category,
                coalesce(le.unit, p.unit, '') as unit,
                coalesce(le.package_description, p.package_description, '') as package_description,
                coalesce(le.image_storage_key, le.image_url, p.image_url) as image_ref,
                coalesce(rs.current_price, 0) as current_price,
                coalesce(rs.baseline_price, 0) as baseline_price,
                rs.last_sold_at
            from products p
            left join latest_enrichment le on le.product_id = p.id
            left join recent_sales rs on rs.product_id = p.id
            where p.id in (:productIds)
            order by p.name asc
            """;
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("salesStart", Timestamp.valueOf(LocalDateTime.now().minusDays(90)))
            .addValue("productIds", productIds);
        return jdbcTemplate.query(sql, params, (rs, rowNum) -> mapCatalogProduct(rs));
    }

    @Transactional(readOnly = true)
    public List<OfferGenerationJobDTO> listJobs(UUID marketId) {
        return offerGenerationJobRepository.findTop50ByMarket_IdOrderByUpdatedAtDesc(marketId).stream()
            .map(this::toJobDto)
            .toList();
    }

    @Transactional(readOnly = true)
    public OfferGenerationJobDTO getJob(UUID marketId, UUID jobId) {
        return toJobDto(findJob(marketId, jobId));
    }

    @Transactional
    public OfferGenerationJobDTO createJob(UUID marketId, OfferGenerationJobCreateRequest request) {
        if (request.getTemplateId() == null) {
            throw new IllegalArgumentException("Template é obrigatório");
        }
        if (request.getProductIds() == null || request.getProductIds().isEmpty()) {
            throw new IllegalArgumentException("Selecione pelo menos um produto");
        }

        Market market = findMarket(marketId);
        OfferTemplate template = offerTemplateRepository.findByIdAndMarket_Id(request.getTemplateId(), marketId)
            .orElseThrow(() -> new IllegalArgumentException("Template não encontrado"));
        List<OfferCatalogProductDTO> products = getCatalogSelection(marketId, request.getProductIds());
        if (products.isEmpty()) {
            throw new IllegalArgumentException("Nenhum produto válido foi encontrado para o lote");
        }

        OfferGenerationJob job = new OfferGenerationJob();
        job.setMarket(market);
        job.setTemplate(template);
        job.setTemplateName(template.getName());
        job.setName(normalizeText(request.getName(), template.getName() + " · " + products.size() + " itens"));
        job.setStatus("DRAFT");
        job.setOutputType(normalizeText(request.getOutputType(), "PNG"));
        job.setGenerationMode(normalizeText(request.getGenerationMode(), "INDIVIDUAL"));
        job.setVariantKey(normalizeText(request.getVariantKey(), normalizeText(template.getDefaultVariantKey(), "default")));
        job.setProductCount(products.size());
        job.setPageCount("CATALOG".equalsIgnoreCase(job.getGenerationMode())
            ? (int) Math.ceil(products.size() / 6.0d)
            : products.size());
        job.setTemplateSnapshotJson(writeJson(normalizeSchema(template)));
        job.setPublishTargetsJson(normalizeText(request.getPublishTargetsJson(), "[\"DOWNLOAD\"]"));
        job.setRenderOptionsJson(normalizeText(request.getRenderOptionsJson(), "{\"quality\":\"high\"}"));
        OfferGenerationJob savedJob = offerGenerationJobRepository.save(job);

        Map<UUID, Product> productsById = new LinkedHashMap<>();
        productRepository.findAllById(request.getProductIds()).forEach(product -> productsById.put(product.getId(), product));

        List<OfferGenerationJobItem> items = new ArrayList<>();
        for (int index = 0; index < products.size(); index++) {
            OfferCatalogProductDTO product = products.get(index);
            OfferGenerationJobItem item = new OfferGenerationJobItem();
            item.setJob(savedJob);
            item.setProduct(productsById.get(product.getProductId()));
            item.setPositionIndex(index);
            item.setSlotIndex(index);
            item.setZoneId("primary-grid");
            item.setProductName(product.getName());
            item.setProductImageUrl(product.getImageUrl());
            item.setProductUnit(product.getUnit());
            item.setCurrentPrice(product.getCurrentPrice());
            item.setStatus("PENDING");
            item.setBindingJson(buildBindingJson(product));
            item.setResolvedBindingJson(buildBindingJson(product));
            items.add(item);
        }
        offerGenerationJobItemRepository.saveAll(items);
        return toJobDto(savedJob);
    }

    @Transactional
    public OfferGenerationJobDTO updateJob(UUID marketId, UUID jobId, OfferGenerationJobCreateRequest request) {
        if (request.getTemplateId() == null) {
            throw new IllegalArgumentException("Template eh obrigatorio");
        }
        if (request.getProductIds() == null || request.getProductIds().isEmpty()) {
            throw new IllegalArgumentException("Selecione pelo menos um produto");
        }

        OfferGenerationJob job = findJob(marketId, jobId);
        OfferTemplate template = offerTemplateRepository.findByIdAndMarket_Id(request.getTemplateId(), marketId)
            .orElseThrow(() -> new IllegalArgumentException("Template nao encontrado"));
        List<OfferCatalogProductDTO> products = getCatalogSelection(marketId, request.getProductIds());
        if (products.isEmpty()) {
            throw new IllegalArgumentException("Nenhum produto valido foi encontrado para a campanha");
        }

        job.setTemplate(template);
        job.setTemplateName(template.getName());
        job.setName(normalizeText(request.getName(), template.getName() + " - " + products.size() + " itens"));
        job.setStatus("DRAFT");
        job.setOutputType(normalizeText(request.getOutputType(), "PNG"));
        job.setGenerationMode(normalizeText(request.getGenerationMode(), "INDIVIDUAL"));
        job.setVariantKey(normalizeText(request.getVariantKey(), normalizeText(template.getDefaultVariantKey(), "default")));
        job.setProductCount(products.size());
        job.setPageCount("CATALOG".equalsIgnoreCase(job.getGenerationMode())
            ? (int) Math.ceil(products.size() / 6.0d)
            : products.size());
        job.setTemplateSnapshotJson(writeJson(normalizeSchema(template)));
        job.setPublishTargetsJson(normalizeText(request.getPublishTargetsJson(), "[\"DOWNLOAD\"]"));
        job.setRenderOptionsJson(normalizeText(request.getRenderOptionsJson(), "{\"quality\":\"high\"}"));
        OfferGenerationJob savedJob = offerGenerationJobRepository.save(job);

        Map<UUID, Product> productsById = new LinkedHashMap<>();
        productRepository.findAllById(request.getProductIds()).forEach(product -> productsById.put(product.getId(), product));

        offerRenderOutputRepository.deleteByJob_Id(jobId);
        offerGenerationJobItemRepository.deleteByJob_Id(jobId);

        List<OfferGenerationJobItem> items = new ArrayList<>();
        for (int index = 0; index < products.size(); index++) {
            OfferCatalogProductDTO product = products.get(index);
            OfferGenerationJobItem item = new OfferGenerationJobItem();
            item.setJob(savedJob);
            item.setProduct(productsById.get(product.getProductId()));
            item.setPositionIndex(index);
            item.setSlotIndex(index);
            item.setZoneId("primary-grid");
            item.setProductName(product.getName());
            item.setProductImageUrl(product.getImageUrl());
            item.setProductUnit(product.getUnit());
            item.setCurrentPrice(product.getCurrentPrice());
            item.setStatus("PENDING");
            item.setBindingJson(buildBindingJson(product));
            item.setResolvedBindingJson(buildBindingJson(product));
            items.add(item);
        }
        offerGenerationJobItemRepository.saveAll(items);
        return toJobDto(savedJob);
    }

    @Transactional
    public OfferGenerationJobDTO cloneJob(UUID marketId, UUID jobId) {
        OfferGenerationJob source = findJob(marketId, jobId);
        OfferGenerationJob clone = new OfferGenerationJob();
        clone.setMarket(source.getMarket());
        clone.setTemplate(source.getTemplate());
        clone.setTemplateName(source.getTemplateName());
        clone.setName(normalizeText(source.getName(), "Campanha") + " copia");
        clone.setStatus("DRAFT");
        clone.setOutputType(normalizeText(source.getOutputType(), "PNG"));
        clone.setGenerationMode(normalizeText(source.getGenerationMode(), "CATALOG"));
        clone.setVariantKey(normalizeText(source.getVariantKey(), "default"));
        clone.setProductCount(source.getProductCount());
        clone.setPageCount(source.getPageCount());
        clone.setTemplateSnapshotJson(normalizeText(source.getTemplateSnapshotJson(), "{}"));
        clone.setPublishTargetsJson(normalizeText(source.getPublishTargetsJson(), "[\"DOWNLOAD\"]"));
        clone.setRenderOptionsJson(normalizeText(source.getRenderOptionsJson(), "{\"quality\":\"high\"}"));
        OfferGenerationJob savedClone = offerGenerationJobRepository.save(clone);

        List<OfferGenerationJobItem> clonedItems = offerGenerationJobItemRepository.findByJob_IdOrderByPositionIndexAsc(jobId).stream()
            .map(item -> {
                OfferGenerationJobItem next = new OfferGenerationJobItem();
                next.setJob(savedClone);
                next.setProduct(item.getProduct());
                next.setPositionIndex(item.getPositionIndex());
                next.setSlotIndex(item.getSlotIndex());
                next.setZoneId(item.getZoneId());
                next.setProductName(item.getProductName());
                next.setProductImageUrl(item.getProductImageUrl());
                next.setProductUnit(item.getProductUnit());
                next.setCurrentPrice(item.getCurrentPrice());
                next.setStatus("PENDING");
                next.setBindingJson(item.getBindingJson());
                next.setResolvedBindingJson(item.getResolvedBindingJson());
                return next;
            })
            .toList();
        offerGenerationJobItemRepository.saveAll(clonedItems);
        return toJobDto(savedClone);
    }

    @Transactional
    public void deleteJob(UUID marketId, UUID jobId) {
        OfferGenerationJob job = findJob(marketId, jobId);
        offerRenderOutputRepository.deleteByJob_Id(jobId);
        offerGenerationJobItemRepository.deleteByJob_Id(jobId);
        offerGenerationJobRepository.delete(job);
    }

    private void ensureStarterData(UUID marketId) {
        OfferBrandKit brandKit = ensureStarterBrandKit(marketId);
        OfferCampaignKit campaignKit = ensureStarterCampaignKit(marketId);
        ensureStarterMarketProfile(marketId);
        ensureStarterTemplates(marketId);
        offerTemplateRepository.findByMarket_IdOrderByIsSystemTemplateDescUpdatedAtDesc(marketId).forEach(template -> {
            boolean changed = false;
            if (template.getSchemaVersion() == null || template.getSchemaVersion() < 2) {
                template.setSchemaVersion(2);
                changed = true;
            }
            if (template.getMasterTemplateKey() == null || template.getMasterTemplateKey().isBlank()) {
                template.setMasterTemplateKey(normalizeText(template.getTemplateKey(), slugify(template.getName())));
                changed = true;
            }
            if (template.getBrandKit() == null) {
                template.setBrandKit(brandKit);
                changed = true;
            }
            if (template.getCampaignKit() == null) {
                template.setCampaignKit(campaignKit);
                changed = true;
            }
            if (changed) {
                offerTemplateRepository.save(template);
            }
            ensureDefaultVariant(template);
        });
    }

    private OfferBrandKit ensureStarterBrandKit(UUID marketId) {
        return offerBrandKitRepository.findByMarket_IdAndKitKey(marketId, "market-default")
            .orElseGet(() -> {
                OfferBrandKit kit = new OfferBrandKit();
                kit.setMarket(findMarket(marketId));
                kit.setKitKey("market-default");
                kit.setName("Marca principal");
                kit.setDescription("Kit base de identidade visual do mercado.");
                kit.setTokensJson(writeJson(starterBrandTokens()));
                kit.setAssetsJson(writeJson(starterBrandAssets()));
                kit.setIsActive(true);
                kit.setIsSystemKit(true);
                return offerBrandKitRepository.save(kit);
            });
    }

    private OfferCampaignKit ensureStarterCampaignKit(UUID marketId) {
        return offerCampaignKitRepository.findByMarket_IdAndKitKey(marketId, "weekly-burst")
            .orElseGet(() -> {
                OfferCampaignKit kit = new OfferCampaignKit();
                kit.setMarket(findMarket(marketId));
                kit.setKitKey("weekly-burst");
                kit.setName("Campanha semanal");
                kit.setDescription("Kit promocional padrao para encartes e cartazes.");
                kit.setSeasonKey("weekly");
                kit.setStartsAt(LocalDateTime.now().minusDays(15));
                kit.setEndsAt(LocalDateTime.now().plusMonths(3));
                kit.setTokensJson(writeJson(starterCampaignTokens("Ofertas da semana")));
                kit.setAssetsJson(writeJson(starterCampaignAssets("weekly-burst")));
                kit.setIsActive(true);
                kit.setIsSystemKit(true);
                return offerCampaignKitRepository.save(kit);
            });
    }

    private OfferMarketProfile ensureStarterMarketProfile(UUID marketId) {
        return offerMarketProfileRepository.findByMarket_Id(marketId)
            .orElseGet(() -> {
                Market market = findMarket(marketId);
                OfferMarketProfile profile = new OfferMarketProfile();
                profile.setMarket(market);
                profile.setFooterContent(normalizeText(market.getName(), "Sua loja") + " · ofertas atualizadas no portal da loja");
                profile.setFooterLegalText("Ofertas validas enquanto durarem os estoques. Imagens meramente ilustrativas.");
                return offerMarketProfileRepository.save(profile);
            });
    }

    private void ensureStarterTemplates(UUID marketId) {
        if (offerTemplateRepository.findByMarket_IdAndTemplateKey(marketId, "poster-premium").isEmpty()) {
            createStarterTemplate(marketId, "poster-premium", "Cartaz premium 1 produto", "Cartaz vertical para destaque de um unico item.", "PRINT", 1080, 1350, buildPosterTemplateJson());
        }
        if (offerTemplateRepository.findByMarket_IdAndTemplateKey(marketId, "encarte-grid").isEmpty()) {
            createStarterTemplate(marketId, "encarte-grid", "Encarte grid 6 produtos", "Pagina de encarte para montagem rapida com seis ofertas.", "FLYER", 1600, 2000, buildFlyerTemplateJson());
        }
    }

    private void createStarterTemplate(
        UUID marketId,
        String templateKey,
        String name,
        String description,
        String channel,
        int canvasWidth,
        int canvasHeight,
        String designJson
    ) {
        OfferTemplate template = new OfferTemplate();
        template.setMarket(findMarket(marketId));
        template.setTemplateKey(templateKey);
        template.setMasterTemplateKey(templateKey);
        template.setName(name);
        template.setDescription(description);
        template.setChannel(channel);
        template.setCanvasWidth(canvasWidth);
        template.setCanvasHeight(canvasHeight);
        template.setSchemaVersion(2);
        template.setDefaultVariantKey("default");
        template.setDesignJson(designJson);
        template.setIsActive(true);
        template.setIsSystemTemplate(true);
        offerTemplateRepository.save(template);
    }

    private void applyTemplateRequest(OfferTemplate template, OfferTemplateUpsertRequest request, boolean keepSystemFlag) {
        String name = normalizeText(request.getName(), null);
        if (name == null) {
            throw new IllegalArgumentException("Nome do template e obrigatorio");
        }
        Integer canvasWidth = request.getCanvasWidth() == null || request.getCanvasWidth() < 300 ? 1080 : request.getCanvasWidth();
        Integer canvasHeight = request.getCanvasHeight() == null || request.getCanvasHeight() < 300 ? 1350 : request.getCanvasHeight();
        String designJson = normalizeText(request.getDesignJson(), buildPosterTemplateJson());

        template.setName(name);
        template.setDescription(normalizeText(request.getDescription(), null));
        template.setChannel(normalizeText(request.getChannel(), "PRINT"));
        template.setCanvasWidth(canvasWidth);
        template.setCanvasHeight(canvasHeight);
        template.setSchemaVersion(request.getSchemaVersion() == null || request.getSchemaVersion() < 2 ? 2 : request.getSchemaVersion());
        template.setMasterTemplateKey(normalizeText(request.getMasterTemplateKey(), normalizeText(template.getMasterTemplateKey(), template.getTemplateKey())));
        template.setDefaultVariantKey(normalizeText(request.getDefaultVariantKey(), template.getDefaultVariantKey()));
        if (request.getBrandKitId() != null && template.getMarket() != null) {
            template.setBrandKit(offerBrandKitRepository.findByIdAndMarket_Id(request.getBrandKitId(), template.getMarket().getId()).orElse(template.getBrandKit()));
        }
        if (request.getCampaignKitId() != null && template.getMarket() != null) {
            template.setCampaignKit(offerCampaignKitRepository.findByIdAndMarket_Id(request.getCampaignKitId(), template.getMarket().getId()).orElse(template.getCampaignKit()));
        }
        template.setDesignJson(writeJson(normalizeSchema(template, designJson, canvasWidth, canvasHeight)));
        template.setIsActive(request.getActive() == null ? Boolean.TRUE : request.getActive());
        if (!keepSystemFlag) {
            template.setIsSystemTemplate(false);
        }
    }

    private OfferCatalogProductDTO mapCatalogProduct(ResultSet rs) throws SQLException {
        UUID productId = uuid(rs, "product_id");
        return new OfferCatalogProductDTO(
            productId,
            rs.getString("ean"),
            rs.getString("name"),
            emptyToNull(rs.getString("brand")),
            emptyToNull(rs.getString("category")),
            emptyToNull(rs.getString("unit")),
            emptyToNull(rs.getString("package_description")),
            catalogImageStorageService.resolveCatalogImageUrl(rs.getString("image_ref"), null),
            defaultMoney(rs.getBigDecimal("current_price")),
            defaultMoney(rs.getBigDecimal("baseline_price")),
            localDateTime(rs, "last_sold_at"),
            productId != null ? "/app/produtos/" + productId : null
        );
    }

    private OfferTemplateDTO toTemplateDto(OfferTemplate template) {
        List<OfferTemplateVariantDTO> variants = offerTemplateVariantRepository.findByTemplate_IdOrderByCreatedAtAsc(template.getId()).stream()
            .map(this::toVariantDto)
            .toList();
        return new OfferTemplateDTO(
            template.getId(),
            template.getTemplateKey(),
            template.getName(),
            template.getDescription(),
            template.getChannel(),
            template.getCanvasWidth(),
            template.getCanvasHeight(),
            template.getSchemaVersion(),
            template.getMasterTemplateKey(),
            template.getDefaultVariantKey(),
            template.getBrandKit() != null ? template.getBrandKit().getId() : null,
            template.getCampaignKit() != null ? template.getCampaignKit().getId() : null,
            writeJson(normalizeSchema(template)),
            template.getPreviewImageUrl(),
            template.getIsActive(),
            template.getIsSystemTemplate(),
            variants,
            template.getCreatedAt(),
            template.getUpdatedAt()
        );
    }

    private OfferMarketProfileDTO toMarketProfileDto(OfferMarketProfile profile) {
        return new OfferMarketProfileDTO(
            profile.getId(),
            profile.getMarket() != null ? profile.getMarket().getId() : null,
            profile.getFooterContent(),
            profile.getFooterLegalText(),
            profile.getPrimaryLogoUrl(),
            profile.getPrimaryLogoStorageKey(),
            profile.getSecondaryLogoUrl(),
            profile.getSecondaryLogoStorageKey(),
            profile.getCreatedAt(),
            profile.getUpdatedAt()
        );
    }

    private OfferAssetUploadDTO toAssetUploadDto(OfferAssetStorageService.StoredAsset asset) {
        return new OfferAssetUploadDTO(asset.assetUrl(), asset.storageKey(), asset.width(), asset.height());
    }

    private OfferBrandKitDTO toBrandKitDto(OfferBrandKit kit) {
        return new OfferBrandKitDTO(
            kit.getId(),
            kit.getKitKey(),
            kit.getName(),
            kit.getDescription(),
            kit.getTokensJson(),
            kit.getAssetsJson(),
            kit.getIsActive(),
            kit.getIsSystemKit(),
            kit.getCreatedAt(),
            kit.getUpdatedAt()
        );
    }

    private OfferCampaignKitDTO toCampaignKitDto(OfferCampaignKit kit) {
        return new OfferCampaignKitDTO(
            kit.getId(),
            kit.getKitKey(),
            kit.getName(),
            kit.getDescription(),
            kit.getSeasonKey(),
            kit.getStartsAt(),
            kit.getEndsAt(),
            kit.getTokensJson(),
            kit.getAssetsJson(),
            kit.getIsActive(),
            kit.getIsSystemKit(),
            kit.getCreatedAt(),
            kit.getUpdatedAt()
        );
    }

    private OfferTemplateVariantDTO toVariantDto(OfferTemplateVariant variant) {
        return new OfferTemplateVariantDTO(
            variant.getId(),
            variant.getTemplate() != null ? variant.getTemplate().getId() : null,
            variant.getVariantKey(),
            variant.getName(),
            variant.getCanvasWidth(),
            variant.getCanvasHeight(),
            variant.getVariantJson(),
            variant.getPreviewImageUrl(),
            variant.getIsActive(),
            variant.getCreatedAt(),
            variant.getUpdatedAt()
        );
    }

    private OfferGenerationJobDTO toJobDto(OfferGenerationJob job) {
        List<OfferGenerationJobItemDTO> items = offerGenerationJobItemRepository.findByJob_IdOrderByPositionIndexAsc(job.getId()).stream()
            .map(item -> new OfferGenerationJobItemDTO(
                item.getId(),
                item.getProduct() != null ? item.getProduct().getId() : null,
                item.getProductName(),
                item.getProductImageUrl(),
                item.getProductUnit(),
                item.getCurrentPrice(),
                item.getStatus(),
                item.getPositionIndex(),
                item.getSlotIndex(),
                item.getZoneId(),
                item.getBindingJson(),
                item.getResolvedBindingJson()
            ))
            .toList();
        List<OfferRenderOutputDTO> outputs = offerRenderOutputRepository.findByJob_IdOrderByCreatedAtDesc(job.getId()).stream()
            .map(this::toRenderOutputDto)
            .toList();

        return new OfferGenerationJobDTO(
            job.getId(),
            job.getTemplate() != null ? job.getTemplate().getId() : null,
            job.getTemplateName(),
            job.getName(),
            job.getStatus(),
            job.getOutputType(),
            job.getGenerationMode(),
            job.getVariantKey(),
            job.getProductCount(),
            job.getPageCount(),
            job.getTemplateSnapshotJson(),
            job.getPublishTargetsJson(),
            job.getRenderOptionsJson(),
            job.getCreatedAt(),
            job.getUpdatedAt(),
            items,
            outputs
        );
    }

    private OfferRenderOutputDTO toRenderOutputDto(OfferRenderOutput output) {
        return new OfferRenderOutputDTO(
            output.getId(),
            output.getJob() != null ? output.getJob().getId() : null,
            output.getTemplate() != null ? output.getTemplate().getId() : null,
            output.getVariantKey(),
            output.getOutputType(),
            output.getPublishTarget(),
            output.getStatus(),
            output.getFileUrl(),
            output.getPreviewImageUrl(),
            output.getErrorMessage(),
            output.getRenderOptionsJson(),
            output.getCreatedAt(),
            output.getUpdatedAt()
        );
    }

    private Market findMarket(UUID marketId) {
        return marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
    }

    private OfferGenerationJob findJob(UUID marketId, UUID jobId) {
        return offerGenerationJobRepository.findByIdAndMarket_Id(jobId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Campanha nao encontrada"));
    }

    private String buildBindingJson(OfferCatalogProductDTO product) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("productId", product.getProductId());
            payload.put("name", product.getName());
            payload.put("price", product.getCurrentPrice());
            payload.put("unit", product.getUnit());
            payload.put("imageUrl", product.getImageUrl());
            payload.put("productUrl", product.getProductUrl());
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Nao foi possivel montar o binding do item", exception);
        }
    }

    private List<OfferCatalogProductDTO> buildJobProducts(UUID jobId) {
        return offerGenerationJobItemRepository.findByJob_IdOrderByPositionIndexAsc(jobId).stream()
            .map(item -> {
                Map<String, Object> binding = parseJsonObject(normalizeText(item.getResolvedBindingJson(), item.getBindingJson()));
                return new OfferCatalogProductDTO(
                    item.getProduct() != null ? item.getProduct().getId() : uuidFromText(String.valueOf(binding.get("productId"))),
                    null,
                    normalizeText(item.getProductName(), String.valueOf(binding.get("name"))),
                    null,
                    null,
                    normalizeText(item.getProductUnit(), String.valueOf(binding.get("unit"))),
                    null,
                    normalizeText(item.getProductImageUrl(), String.valueOf(binding.get("imageUrl"))),
                    item.getCurrentPrice() != null ? item.getCurrentPrice() : defaultMoney(numberToBigDecimal(binding.get("price"))),
                    defaultMoney(numberToBigDecimal(binding.get("price"))),
                    null,
                    normalizeText(String.valueOf(binding.get("productUrl")), null)
                );
            })
            .toList();
    }

    private void applyMarketProfileRequest(OfferMarketProfile profile, OfferMarketProfileUpsertRequest request) {
        if (request == null) {
            return;
        }
        if (request.getFooterContent() != null) {
            profile.setFooterContent(emptyToNull(request.getFooterContent()));
        }
        if (request.getFooterLegalText() != null) {
            profile.setFooterLegalText(emptyToNull(request.getFooterLegalText()));
        }
        if (request.getPrimaryLogoUrl() != null) {
            profile.setPrimaryLogoUrl(emptyToNull(request.getPrimaryLogoUrl()));
            if (profile.getPrimaryLogoUrl() == null) {
                profile.setPrimaryLogoStorageKey(null);
            }
        }
        if (request.getSecondaryLogoUrl() != null) {
            profile.setSecondaryLogoUrl(emptyToNull(request.getSecondaryLogoUrl()));
            if (profile.getSecondaryLogoUrl() == null) {
                profile.setSecondaryLogoStorageKey(null);
            }
        }
    }
    private String buildPosterTemplateJsonLegacy() {
        try {
            return objectMapper.writeValueAsString(Map.of(
                "version", 1,
                "background", Map.of(
                    "type", "gradient",
                    "start", "#fff7ef",
                    "end", "#ffd4b4"
                ),
                "static", Map.of(
                    "kicker", "Oferta em destaque",
                    "headline", "Preço que chama atenção e produto com leitura limpa."
                ),
                "slots", List.of(
                    Map.of("id", "kicker", "type", "tag", "binding", "static.kicker", "x", 48, "y", 48, "w", 280, "h", 44),
                    Map.of("id", "headline", "type", "text", "binding", "static.headline", "x", 48, "y", 112, "w", 460, "h", 140, "fontSize", 44, "fontWeight", 800),
                    Map.of("id", "image", "type", "image", "binding", "product.imageUrl", "x", 48, "y", 280, "w", 540, "h", 540, "background", "#ffffff", "radius", 32, "fit", "contain"),
                    Map.of("id", "name", "type", "text", "binding", "product.name", "x", 48, "y", 852, "w", 620, "h", 120, "fontSize", 40, "fontWeight", 800),
                    Map.of("id", "unit", "type", "badge", "binding", "product.unit", "x", 48, "y", 990, "w", 220, "h", 42),
                    Map.of("id", "price", "type", "price", "binding", "product.currentPrice", "x", 700, "y", 520, "w", 320, "h", 200),
                    Map.of("id", "footer", "type", "text", "binding", "product.packageDescription", "x", 48, "y", 1120, "w", 620, "h", 90, "fontSize", 24, "fontWeight", 500),
                    Map.of("id", "qr", "type", "qrcode", "binding", "product.productUrl", "x", 760, "y", 890, "w", 180, "h", 180)
                )
            ));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Não foi possível montar o template inicial", exception);
        }
    }

    private String buildFlyerTemplateJsonLegacy() {
        try {
            return objectMapper.writeValueAsString(Map.of(
                "version", 1,
                "background", Map.of(
                    "type", "solid",
                    "color", "#fff6ee"
                ),
                "static", Map.of(
                    "kicker", "Encarte rápido",
                    "headline", "Grade pronta para abastecer o tabloide da semana."
                ),
                "layout", Map.of(
                    "cardsPerPage", 6
                ),
                "slots", List.of(
                    Map.of("id", "headline", "type", "text", "binding", "static.headline", "x", 48, "y", 48, "w", 960, "h", 120, "fontSize", 40, "fontWeight", 800),
                    Map.of("id", "grid", "type", "product-grid", "x", 48, "y", 220, "w", 1504, "h", 1680, "columns", 2, "rows", 3)
                )
            ));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Não foi possível montar o template de encarte", exception);
        }
    }

    private String buildPosterTemplateJson() {
        try {
            return objectMapper.writeValueAsString(Map.of(
                "schemaVersion", 2,
                "canvas", Map.of(
                    "width", 1080,
                    "height", 1350,
                    "safeArea", Map.of("top", 48, "right", 48, "bottom", 48, "left", 48),
                    "background", Map.of("type", "gradient", "start", "#fff7ef", "end", "#ffd4b4")
                ),
                "layers", List.of(
                    Map.of("id", "kicker", "type", "tag", "binding", "campaign.kicker", "locked", true, "visible", true, "bounds", Map.of("x", 72, "y", 72, "w", 260, "h", 44), "props", Map.of("fontSize", 24, "fontWeight", 700, "background", "rgba(255,255,255,0.86)", "radius", 999)),
                    Map.of("id", "headline", "type", "text", "binding", "campaign.headline", "locked", true, "visible", true, "bounds", Map.of("x", 72, "y", 132, "w", 620, "h", 124), "props", Map.of("fontSize", 58, "fontWeight", 800)),
                    Map.of("id", "subheadline", "type", "text", "binding", "campaign.subheadline", "locked", true, "visible", true, "bounds", Map.of("x", 72, "y", 268, "w", 640, "h", 88), "props", Map.of("fontSize", 28, "fontWeight", 500)),
                    Map.of("id", "campaign-badge", "type", "campaignbadge", "binding", "static.assets.campaignBadgeUrl", "locked", true, "visible", true, "bounds", Map.of("x", 814, "y", 72, "w", 194, "h", 194), "props", Map.of("radius", 0, "frame", false, "fit", "contain")),
                    Map.of("id", "footer", "type", "footer", "locked", true, "visible", true, "bounds", Map.of("x", 72, "y", 1220, "w", 936, "h", 72), "props", Map.of("radius", 18, "background", "#2c1d17", "textColor", "#fff4ee", "containerOnly", true)),
                    Map.of("id", "footer-content", "type", "text", "binding", "marketProfile.footer.content", "locked", true, "visible", true, "bounds", Map.of("x", 248, "y", 1232, "w", 452, "h", 46), "props", Map.of("fontSize", 15, "fontWeight", 600, "textColor", "#fff4ee")),
                    Map.of("id", "footer-legal", "type", "text", "binding", "marketProfile.footer.legalText", "locked", true, "visible", true, "bounds", Map.of("x", 700, "y", 1232, "w", 288, "h", 46), "props", Map.of("fontSize", 12, "fontWeight", 500, "textColor", "#fff4ee")),
                    Map.of("id", "footer-logo-left", "type", "image", "binding", "marketProfile.assets.primaryLogo.imageUrl", "locked", true, "visible", true, "bounds", Map.of("x", 88, "y", 1230, "w", 132, "h", 52), "props", Map.of("radius", 0, "frame", false, "fit", "contain")),
                    Map.of("id", "footer-logo-right", "type", "image", "binding", "marketProfile.assets.secondaryLogo.imageUrl", "locked", true, "visible", false, "bounds", Map.of("x", 876, "y", 1230, "w", 116, "h", 52), "props", Map.of("radius", 0, "frame", false, "fit", "contain"))
                ),
                "productZones", List.of(
                    Map.of("id", "content-zone", "name", "Area de conteudo", "zoneType", "single", "layout", "single", "columns", 1, "rows", 1, "slotCount", 1, "bounds", Map.of("x", 72, "y", 388, "w", 936, "h", 784), "cardTemplate", defaultCardTemplate())
                ),
                "bindings", Map.of("static", Map.of("assets", Map.of("backgroundImageUrl", "", "campaignBadgeUrl", ""))),
                "brandTokens", Map.of(),
                "campaignTokens", starterCampaignTokens("Oferta do dia")
            ));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Nao foi possivel montar o template inicial", exception);
        }
    }

    private String buildFlyerTemplateJson() {
        try {
            return objectMapper.writeValueAsString(Map.of(
                "schemaVersion", 2,
                "canvas", Map.of(
                    "width", 1600,
                    "height", 2000,
                    "safeArea", Map.of("top", 56, "right", 56, "bottom", 56, "left", 56),
                    "background", Map.of("type", "solid", "color", "#fff6ee")
                ),
                "layers", List.of(
                    Map.of("id", "kicker", "type", "tag", "binding", "campaign.kicker", "locked", true, "visible", true, "bounds", Map.of("x", 72, "y", 64, "w", 260, "h", 48), "props", Map.of("fontSize", 24, "fontWeight", 700, "background", "rgba(255,255,255,0.86)", "radius", 999)),
                    Map.of("id", "headline", "type", "text", "binding", "campaign.headline", "locked", true, "visible", true, "bounds", Map.of("x", 72, "y", 132, "w", 920, "h", 128), "props", Map.of("fontSize", 54, "fontWeight", 800)),
                    Map.of("id", "subheadline", "type", "text", "binding", "campaign.subheadline", "locked", true, "visible", true, "bounds", Map.of("x", 72, "y", 272, "w", 980, "h", 96), "props", Map.of("fontSize", 28, "fontWeight", 500)),
                    Map.of("id", "campaign-badge", "type", "campaignbadge", "binding", "static.assets.campaignBadgeUrl", "locked", true, "visible", true, "bounds", Map.of("x", 1310, "y", 72, "w", 210, "h", 210), "props", Map.of("radius", 0, "frame", false, "fit", "contain")),
                    Map.of("id", "footer", "type", "footer", "locked", true, "visible", true, "bounds", Map.of("x", 72, "y", 1880, "w", 1456, "h", 72), "props", Map.of("radius", 18, "background", "#2c1d17", "textColor", "#fff4ee", "containerOnly", true)),
                    Map.of("id", "footer-content", "type", "text", "binding", "marketProfile.footer.content", "locked", true, "visible", true, "bounds", Map.of("x", 276, "y", 1892, "w", 720, "h", 46), "props", Map.of("fontSize", 16, "fontWeight", 600, "textColor", "#fff4ee")),
                    Map.of("id", "footer-legal", "type", "text", "binding", "marketProfile.footer.legalText", "locked", true, "visible", true, "bounds", Map.of("x", 1020, "y", 1892, "w", 480, "h", 46), "props", Map.of("fontSize", 12, "fontWeight", 500, "textColor", "#fff4ee")),
                    Map.of("id", "footer-logo-left", "type", "image", "binding", "marketProfile.assets.primaryLogo.imageUrl", "locked", true, "visible", true, "bounds", Map.of("x", 88, "y", 1890, "w", 164, "h", 52), "props", Map.of("radius", 0, "frame", false, "fit", "contain")),
                    Map.of("id", "footer-logo-right", "type", "image", "binding", "marketProfile.assets.secondaryLogo.imageUrl", "locked", true, "visible", false, "bounds", Map.of("x", 1360, "y", 1890, "w", 140, "h", 52), "props", Map.of("radius", 0, "frame", false, "fit", "contain"))
                ),
                "productZones", List.of(
                    Map.of("id", "content-zone", "name", "Area de conteudo", "zoneType", "grid", "layout", "grid", "columns", 2, "rows", 3, "slotCount", 6, "bounds", Map.of("x", 72, "y", 408, "w", 1456, "h", 1428), "cardTemplate", defaultCardTemplate())
                ),
                "bindings", Map.of("static", Map.of("assets", Map.of("backgroundImageUrl", "", "campaignBadgeUrl", ""))),
                "brandTokens", Map.of(),
                "campaignTokens", starterCampaignTokens("Ofertas da semana")
            ));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Nao foi possivel montar o template de encarte", exception);
        }
    }

    private OfferBrandKit resolveBrandKit(UUID marketId, OfferTemplate template, UUID brandKitId) {
        if (brandKitId != null) {
            return offerBrandKitRepository.findByIdAndMarket_Id(brandKitId, marketId).orElse(template.getBrandKit());
        }
        if (template.getBrandKit() != null) {
            return template.getBrandKit();
        }
        return offerBrandKitRepository.findByMarket_IdOrderByIsSystemKitDescUpdatedAtDesc(marketId).stream().findFirst().orElse(null);
    }

    private OfferCampaignKit resolveCampaignKit(UUID marketId, OfferTemplate template, UUID campaignKitId) {
        if (campaignKitId != null) {
            return offerCampaignKitRepository.findByIdAndMarket_Id(campaignKitId, marketId).orElse(template.getCampaignKit());
        }
        if (template.getCampaignKit() != null) {
            return template.getCampaignKit();
        }
        return offerCampaignKitRepository.findByMarket_IdOrderByIsSystemKitDescUpdatedAtDesc(marketId).stream().findFirst().orElse(null);
    }

    private void ensureDefaultVariant(OfferTemplate template) {
        List<OfferTemplateVariant> variants = offerTemplateVariantRepository.findByTemplate_IdOrderByCreatedAtAsc(template.getId());
        if (variants.isEmpty()) {
            OfferTemplateVariant variant = new OfferTemplateVariant();
            variant.setTemplate(template);
            variant.setVariantKey(normalizeText(template.getDefaultVariantKey(), "default"));
            variant.setName("Formato principal");
            variant.setCanvasWidth(template.getCanvasWidth());
            variant.setCanvasHeight(template.getCanvasHeight());
            variant.setVariantJson(writeJson(Map.of(
                "variantKey", normalizeText(template.getDefaultVariantKey(), "default"),
                "name", "Formato principal",
                "canvasWidth", template.getCanvasWidth(),
                "canvasHeight", template.getCanvasHeight(),
                "fitMode", "fit"
            )));
            variant.setIsActive(true);
            OfferTemplateVariant saved = offerTemplateVariantRepository.save(variant);
            template.setDefaultVariantKey(saved.getVariantKey());
        } else if (template.getDefaultVariantKey() == null || template.getDefaultVariantKey().isBlank()) {
            template.setDefaultVariantKey(variants.get(0).getVariantKey());
        }
        if (template.getSchemaVersion() == null || template.getSchemaVersion() < 2) {
            template.setSchemaVersion(2);
        }
        template.setDesignJson(writeJson(normalizeSchema(template)));
        offerTemplateRepository.save(template);
    }

    private Map<String, Object> normalizeSchema(OfferTemplate template) {
        return normalizeSchema(template, template.getDesignJson(), template.getCanvasWidth(), template.getCanvasHeight());
    }

    private Map<String, Object> normalizeSchema(OfferTemplate template, String designJson, Integer canvasWidth, Integer canvasHeight) {
        Map<String, Object> parsed = parseJsonObject(designJson);
        int width = canvasWidth != null ? canvasWidth : 1080;
        int height = canvasHeight != null ? canvasHeight : 1350;
        Object version = parsed.get("schemaVersion");
        if (version instanceof Number number && number.intValue() >= 2 && parsed.containsKey("layers")) {
            Map<String, Object> normalized = new LinkedHashMap<>(parsed);
            Map<String, Object> canvas = new LinkedHashMap<>(asMap(normalized.get("canvas")));
            canvas.put("width", width);
            canvas.put("height", height);
            normalized.put("canvas", canvas);
            normalized.put("schemaVersion", 2);
            normalized.putIfAbsent("layers", List.of());
            normalized.putIfAbsent("productZones", List.of());
            normalized.putIfAbsent("bindings", Map.of());
            normalized.putIfAbsent("brandTokens", Map.of());
            normalized.putIfAbsent("campaignTokens", Map.of());
            return upgradeNormalizedSchema(normalized, width, height);
        }
        return upgradeNormalizedSchema(migrateLegacySchema(template, parsed, width, height), width, height);
    }

    private Map<String, Object> migrateLegacySchema(OfferTemplate template, Map<String, Object> parsed, int width, int height) {
        List<Map<String, Object>> layers = new ArrayList<>();
        List<Map<String, Object>> zones = new ArrayList<>();
        Map<String, Object> background = asMap(parsed.get("background"));
        Map<String, Object> statics = asMap(parsed.get("static"));

        for (Map<String, Object> slot : listOfMaps(parsed.get("slots"))) {
            String type = String.valueOf(slot.getOrDefault("type", "text"));
            String slotId = String.valueOf(slot.getOrDefault("id", slugify(type) + "-layer"));
            if ("product-grid".equalsIgnoreCase(type)) {
                int columns = intValue(slot.get("columns"), 2);
                int rows = intValue(slot.get("rows"), 3);
                Map<String, Object> zone = new LinkedHashMap<>();
                zone.put("id", slotId);
                zone.put("zoneType", "grid");
                zone.put("layout", "grid");
                zone.put("columns", columns);
                zone.put("rows", rows);
                zone.put("slotCount", Math.max(1, columns * rows));
                zone.put("bounds", boundsFromLegacySlot(slot, width, height));
                zone.put("cardTemplate", defaultCardTemplate());
                zones.add(zone);
                continue;
            }

            Map<String, Object> layer = new LinkedHashMap<>();
            layer.put("id", slotId);
            layer.put("type", type);
            layer.put("binding", slot.get("binding"));
            layer.put("locked", true);
            layer.put("bounds", boundsFromLegacySlot(slot, width, height));
            layer.put("props", legacyLayerProps(slot));
            layers.add(layer);
        }

        if (layers.isEmpty()) {
            layers.addAll(listOfMaps(parseJsonObject("FLYER".equalsIgnoreCase(template.getChannel()) ? buildFlyerTemplateJson() : buildPosterTemplateJson()).get("layers")));
        }
        if (zones.isEmpty()) {
            Map<String, Object> zone = new LinkedHashMap<>();
            zone.put("id", "FLYER".equalsIgnoreCase(template.getChannel()) ? "primary-grid" : "hero-product");
            zone.put("zoneType", "FLYER".equalsIgnoreCase(template.getChannel()) ? "grid" : "hero");
            zone.put("layout", "FLYER".equalsIgnoreCase(template.getChannel()) ? "grid" : "single");
            zone.put("columns", 2);
            zone.put("rows", 3);
            zone.put("slotCount", "FLYER".equalsIgnoreCase(template.getChannel()) ? 6 : 1);
            zone.put("bounds", Map.of("x", 72, "y", 520, "w", Math.max(width - 144, 640), "h", Math.max(height - 720, 420)));
            zone.put("cardTemplate", defaultCardTemplate());
            zones.add(zone);
        }

        Map<String, Object> migrated = new LinkedHashMap<>();
        migrated.put("schemaVersion", 2);
        migrated.put("canvas", Map.of(
            "width", width,
            "height", height,
            "safeArea", Map.of("top", 48, "right", 48, "bottom", 48, "left", 48),
            "background", background.isEmpty() ? Map.of("type", "solid", "color", "#fff7ef") : background
        ));
        migrated.put("layers", layers);
        migrated.put("productZones", zones);
        migrated.put("bindings", Map.of("static", statics));
        migrated.put("brandTokens", Map.of());
        migrated.put("campaignTokens", Map.of());
        return migrated;
    }

    private Map<String, Object> upgradeNormalizedSchema(Map<String, Object> normalized, int width, int height) {
        Map<String, Object> upgraded = new LinkedHashMap<>(normalized);
        List<Map<String, Object>> layers = new ArrayList<>(listOfMaps(upgraded.get("layers")));
        List<Map<String, Object>> zones = new ArrayList<>(listOfMaps(upgraded.get("productZones")));
        Map<String, Object> bindings = new LinkedHashMap<>(asMap(upgraded.get("bindings")));
        Map<String, Object> staticBindings = new LinkedHashMap<>(asMap(bindings.get("static")));
        Map<String, Object> staticFooter = new LinkedHashMap<>(asMap(staticBindings.get("footer")));

        for (int index = 0; index < layers.size(); index++) {
            Map<String, Object> layer = new LinkedHashMap<>(layers.get(index));
            String layerId = normalizeText(String.valueOf(layer.get("id")), "").toLowerCase(Locale.ROOT);
            String binding = normalizeText(String.valueOf(layer.get("binding")), null);
            if ("kicker".equals(layerId) && (binding == null || binding.startsWith("static."))) {
                layer.put("binding", "campaign.kicker");
            } else if ("headline".equals(layerId) && (binding == null || binding.startsWith("static."))) {
                layer.put("binding", "campaign.headline");
            } else if ("subheadline".equals(layerId) && (binding == null || binding.startsWith("static."))) {
                layer.put("binding", "campaign.subheadline");
            } else if ("footer".equals(layerId) && "static.footer.text".equalsIgnoreCase(normalizeText(binding, ""))) {
                Map<String, Object> props = new LinkedHashMap<>(asMap(layer.get("props")));
                props.put("containerOnly", true);
                layer.put("props", props);
                layer.remove("binding");
            } else if ("footer-logo-left".equals(layerId) && "static.footer.logoLeftUrl".equalsIgnoreCase(normalizeText(binding, ""))) {
                layer.put("binding", "marketProfile.assets.primaryLogo.imageUrl");
            } else if ("footer-logo-right".equals(layerId) && "static.footer.logoRightUrl".equalsIgnoreCase(normalizeText(binding, ""))) {
                layer.put("binding", "marketProfile.assets.secondaryLogo.imageUrl");
            }
            layers.set(index, layer);
        }

        Map<String, Object> footerLayer = layers.stream()
            .filter(layer -> "footer".equalsIgnoreCase(String.valueOf(layer.get("id"))))
            .findFirst()
            .orElse(null);
        if (footerLayer != null) {
            Map<String, Object> footerBounds = asMap(footerLayer.get("bounds"));
            Map<String, Object> footerProps = new LinkedHashMap<>(asMap(footerLayer.get("props")));
            footerProps.put("containerOnly", true);
            footerLayer.put("props", footerProps);
            footerLayer.remove("binding");

            if (layers.stream().noneMatch(layer -> "footer-content".equalsIgnoreCase(String.valueOf(layer.get("id"))))) {
                layers.add(newTextLayer(
                    "footer-content",
                    "Texto do rodape",
                    "marketProfile.footer.content",
                    intValue(footerBounds.get("x"), 72) + 168,
                    intValue(footerBounds.get("y"), height - 148) + 12,
                    Math.max(220, intValue(footerBounds.get("w"), width - 144) - 360),
                    Math.max(22, intValue(footerBounds.get("h"), 72) - 20),
                    15,
                    600,
                    true,
                    colorText(footerProps.get("textColor"), "#fff4ee")
                ));
            }
            if (layers.stream().noneMatch(layer -> "footer-legal".equalsIgnoreCase(String.valueOf(layer.get("id"))))) {
                layers.add(newTextLayer(
                    "footer-legal",
                    "Aviso legal",
                    "marketProfile.footer.legalText",
                    intValue(footerBounds.get("x"), 72) + intValue(footerBounds.get("w"), width - 144) - 360,
                    intValue(footerBounds.get("y"), height - 148) + 12,
                    320,
                    Math.max(22, intValue(footerBounds.get("h"), 72) - 20),
                    12,
                    500,
                    true,
                    colorText(footerProps.get("textColor"), "#fff4ee")
                ));
            }
        }

        if (layers.stream().noneMatch(layer -> "footer-logo-left".equalsIgnoreCase(String.valueOf(layer.get("id"))))) {
            layers.add(newImageLayer("footer-logo-left", "Logo rodape esquerdo", "marketProfile.assets.primaryLogo.imageUrl", 88, height - 138, 140, 52, true));
        }
        if (layers.stream().noneMatch(layer -> "footer-logo-right".equalsIgnoreCase(String.valueOf(layer.get("id"))))) {
            layers.add(newImageLayer("footer-logo-right", "Logo rodape direito", "marketProfile.assets.secondaryLogo.imageUrl", width - 228, height - 138, 140, 52, true));
        }

        if (zones.isEmpty()) {
            Map<String, Object> zone = new LinkedHashMap<>();
            zone.put("id", "content-zone");
            zone.put("zoneType", "grid");
            zone.put("layout", "grid");
            zone.put("columns", 2);
            zone.put("rows", 3);
            zone.put("slotCount", 6);
            zone.put("bounds", Map.of("x", 72, "y", 360, "w", Math.max(width - 144, 640), "h", Math.max(height - 540, 420)));
            zone.put("cardTemplate", defaultCardTemplate());
            zones.add(zone);
        } else {
            for (int index = 0; index < zones.size(); index++) {
                Map<String, Object> zone = new LinkedHashMap<>(zones.get(index));
                Map<String, Object> cardTemplate = new LinkedHashMap<>(defaultCardTemplate());
                cardTemplate.putAll(asMap(zone.get("cardTemplate")));
                zone.put("cardTemplate", cardTemplate);
                zones.set(index, zone);
            }
        }

        if (!staticFooter.isEmpty()) {
            staticBindings.remove("footer");
        }
        bindings.put("static", staticBindings);
        upgraded.put("bindings", bindings);
        upgraded.put("layers", layers);
        upgraded.put("productZones", zones);
        upgraded.putIfAbsent("brandTokens", Map.of());
        upgraded.putIfAbsent("campaignTokens", Map.of());
        return upgraded;
    }

    private Map<String, Object> defaultCardTemplate() {
        return new LinkedHashMap<>(Map.ofEntries(
            Map.entry("imageFit", "contain"),
            Map.entry("showBaselinePrice", true),
            Map.entry("showUnit", true),
            Map.entry("showDescription", true),
            Map.entry("background", "#ffffff"),
            Map.entry("borderColor", "#ead9ca"),
            Map.entry("textColor", "#1f1613"),
            Map.entry("priceLayout", "inline"),
            Map.entry("priceBoxBackground", "#ff3b1f"),
            Map.entry("priceBoxTextColor", "#ffffff"),
            Map.entry("priceBoxLabelColor", "#fff1d6"),
            Map.entry("priceLabel", "R$"),
            Map.entry("priceBorderColor", "#ffc44f"),
            Map.entry("priceBorderWidth", 4),
            Map.entry("priceBorderStyle", "solid"),
            Map.entry("pricePaddingX", 16),
            Map.entry("pricePaddingY", 12),
            Map.entry("priceGap", 12),
            Map.entry("priceLabelBackground", "#ffffff"),
            Map.entry("priceLabelTextColor", "#fff1d6"),
            Map.entry("priceLabelBorderColor", "#ffffff"),
            Map.entry("priceLabelRadius", 999),
            Map.entry("priceLabelSize", 72),
            Map.entry("priceLabelFontSize", 24),
            Map.entry("priceValueColor", "#ffffff"),
            Map.entry("priceFractionColor", "#ffffff"),
            Map.entry("priceFractionFontSize", 28),
            Map.entry("priceUnitColor", "#ffffff"),
            Map.entry("priceUnitFontSize", 18),
            Map.entry("priceUnitLayout", "stacked"),
            Map.entry("priceBaselineColor", "#7a5b49"),
            Map.entry("priceBaselineFontSize", 13),
            Map.entry("cardRadius", 28),
            Map.entry("priceBoxRadius", 26),
            Map.entry("nameFontSize", 30),
            Map.entry("descriptionFontSize", 18),
            Map.entry("priceFontSize", 54)
        ));
    }

    private Map<String, Object> newTextLayer(
        String id,
        String name,
        String binding,
        int x,
        int y,
        int w,
        int h,
        int fontSize,
        int fontWeight,
        boolean locked,
        String textColor
    ) {
        return new LinkedHashMap<>(Map.of(
            "id", id,
            "name", name,
            "type", "text",
            "binding", binding,
            "locked", locked,
            "visible", true,
            "bounds", Map.of("x", x, "y", y, "w", w, "h", h),
            "props", Map.of(
                "fontSize", fontSize,
                "fontWeight", fontWeight,
                "textColor", textColor
            )
        ));
    }

    private Map<String, Object> newImageLayer(String id, String name, String binding, int x, int y, int w, int h, boolean locked) {
        return new LinkedHashMap<>(Map.of(
            "id", id,
            "name", name,
            "type", "image",
            "binding", binding,
            "locked", locked,
            "visible", true,
            "bounds", Map.of("x", x, "y", y, "w", w, "h", h),
            "props", Map.of(
                "radius", 0,
                "frame", false,
                "fit", "contain"
            )
        ));
    }

    private String colorText(Object value, String fallback) {
        String normalized = normalizeText(String.valueOf(value), null);
        return normalized != null && normalized.startsWith("#") ? normalized : fallback;
    }

    private Map<String, Object> buildCampaignTokens(OfferCampaignKit campaignKit, Map<String, Object> renderOptions) {
        Map<String, Object> tokens = new LinkedHashMap<>(campaignKit != null ? parseJsonObject(campaignKit.getTokensJson()) : Map.of());
        Map<String, Object> campaignCopy = asMap(renderOptions == null ? null : renderOptions.get("campaignCopy"));
        if (!campaignCopy.isEmpty()) {
            putIfPresent(tokens, "kicker", campaignCopy.get("kicker"));
            putIfPresent(tokens, "headline", campaignCopy.get("headline"));
            putIfPresent(tokens, "subheadline", campaignCopy.get("subheadline"));
            putIfPresent(tokens, "badgeLabel", campaignCopy.get("badgeLabel"));
        }
        return tokens;
    }

    private Map<String, Object> marketProfileAsMap(OfferMarketProfile profile) {
        if (profile == null) {
            return Map.of();
        }
        return new LinkedHashMap<>(Map.of(
            "footer", Map.of(
                "content", normalizeText(profile.getFooterContent(), ""),
                "legalText", normalizeText(profile.getFooterLegalText(), "")
            ),
            "assets", Map.of(
                "primaryLogo", Map.of(
                    "imageUrl", normalizeText(profile.getPrimaryLogoUrl(), ""),
                    "storageKey", normalizeText(profile.getPrimaryLogoStorageKey(), "")
                ),
                "secondaryLogo", Map.of(
                    "imageUrl", normalizeText(profile.getSecondaryLogoUrl(), ""),
                    "storageKey", normalizeText(profile.getSecondaryLogoStorageKey(), "")
                )
            )
        ));
    }

    private void putIfPresent(Map<String, Object> target, String key, Object value) {
        String normalized = normalizeText(value == null ? null : String.valueOf(value), null);
        if (normalized != null) {
            target.put(key, normalized);
        }
    }

    private Map<String, Object> buildResolvedDesign(
        OfferTemplate template,
        OfferTemplateVariant variant,
        OfferBrandKit brandKit,
        OfferCampaignKit campaignKit,
        OfferMarketProfile marketProfile,
        List<OfferCatalogProductDTO> products,
        Map<String, Object> renderOptions
    ) {
        Map<String, Object> normalized = normalizeSchema(template);
        Map<String, Object> resolved = new LinkedHashMap<>(normalized);
        Map<String, Object> canvas = new LinkedHashMap<>(asMap(normalized.get("canvas")));
        if (variant != null) {
            canvas.put("width", variant.getCanvasWidth());
            canvas.put("height", variant.getCanvasHeight());
            resolved.put("variant", parseJsonObject(variant.getVariantJson()));
        }
        resolved.put("canvas", canvas);
        resolved.put("brandTokens", brandKit != null ? parseJsonObject(brandKit.getTokensJson()) : Map.of());
        resolved.put("brandAssets", brandKit != null ? parseJsonObject(brandKit.getAssetsJson()) : Map.of());
        resolved.put("campaignTokens", buildCampaignTokens(campaignKit, renderOptions));
        resolved.put("campaignAssets", campaignKit != null ? parseJsonObject(campaignKit.getAssetsJson()) : Map.of());
        resolved.put("marketProfile", marketProfileAsMap(marketProfile));
        resolved.put("renderOptions", renderOptions == null ? Map.of() : renderOptions);
        resolved.put("resolvedProducts", products.stream().map(this::productAsMap).toList());
        resolved.put("zoneBindings", buildZoneBindings(normalized, products));
        return resolved;
    }

    private Map<String, Object> buildZoneBindings(Map<String, Object> normalized, List<OfferCatalogProductDTO> products) {
        Map<String, Object> bindings = new LinkedHashMap<>();
        int cursor = 0;
        for (Map<String, Object> zone : listOfMaps(normalized.get("productZones"))) {
            int slotCount = intValue(zone.get("slotCount"), 1);
            List<Map<String, Object>> slottedProducts = new ArrayList<>();
            for (int index = 0; index < slotCount && cursor < products.size(); index++) {
                slottedProducts.add(productAsMap(products.get(cursor)));
                cursor++;
            }
            bindings.put(String.valueOf(zone.getOrDefault("id", "zone-" + bindings.size())), slottedProducts);
        }
        return bindings;
    }

    private void applyBrandKitRequest(OfferBrandKit kit, OfferBrandKitUpsertRequest request, boolean keepSystemFlag) {
        String name = normalizeText(request.getName(), null);
        if (name == null) {
            throw new IllegalArgumentException("Nome do brand kit e obrigatorio");
        }
        kit.setKitKey(normalizeText(request.getKitKey(), slugify(name)));
        kit.setName(name);
        kit.setDescription(normalizeText(request.getDescription(), null));
        kit.setTokensJson(writeJson(parseJsonObject(normalizeText(request.getTokensJson(), writeJson(starterBrandTokens())))));
        kit.setAssetsJson(writeJson(parseJsonObject(normalizeText(request.getAssetsJson(), writeJson(starterBrandAssets())))));
        kit.setIsActive(request.getActive() == null ? Boolean.TRUE : request.getActive());
        if (!keepSystemFlag) {
            kit.setIsSystemKit(false);
        }
    }

    private void applyCampaignKitRequest(OfferCampaignKit kit, OfferCampaignKitUpsertRequest request, boolean keepSystemFlag) {
        String name = normalizeText(request.getName(), null);
        if (name == null) {
            throw new IllegalArgumentException("Nome do campaign kit e obrigatorio");
        }
        kit.setKitKey(normalizeText(request.getKitKey(), slugify(name)));
        kit.setName(name);
        kit.setDescription(normalizeText(request.getDescription(), null));
        kit.setSeasonKey(normalizeText(request.getSeasonKey(), null));
        kit.setStartsAt(request.getStartsAt());
        kit.setEndsAt(request.getEndsAt());
        kit.setTokensJson(writeJson(parseJsonObject(normalizeText(request.getTokensJson(), writeJson(starterCampaignTokens(name))))));
        kit.setAssetsJson(writeJson(parseJsonObject(normalizeText(request.getAssetsJson(), writeJson(starterCampaignAssets(slugify(name)))))));
        kit.setIsActive(request.getActive() == null ? Boolean.TRUE : request.getActive());
        if (!keepSystemFlag) {
            kit.setIsSystemKit(false);
        }
    }

    private void applyVariantRequest(OfferTemplateVariant variant, OfferTemplateVariantUpsertRequest request) {
        String name = normalizeText(request.getName(), null);
        if (name == null) {
            throw new IllegalArgumentException("Nome da variante e obrigatorio");
        }
        Integer canvasWidth = request.getCanvasWidth() == null || request.getCanvasWidth() < 300 ? 1080 : request.getCanvasWidth();
        Integer canvasHeight = request.getCanvasHeight() == null || request.getCanvasHeight() < 300 ? 1350 : request.getCanvasHeight();
        String variantKey = normalizeText(request.getVariantKey(), slugify(name));

        variant.setVariantKey(variantKey);
        variant.setName(name);
        variant.setCanvasWidth(canvasWidth);
        variant.setCanvasHeight(canvasHeight);
        variant.setVariantJson(writeJson(parseJsonObject(normalizeText(request.getVariantJson(), writeJson(Map.of(
            "variantKey", variantKey,
            "name", name,
            "canvasWidth", canvasWidth,
            "canvasHeight", canvasHeight,
            "fitMode", "fit"
        ))))));
        variant.setPreviewImageUrl(normalizeText(request.getPreviewImageUrl(), variant.getPreviewImageUrl()));
        variant.setIsActive(request.getActive() == null ? Boolean.TRUE : request.getActive());
    }

    private List<Map<String, Object>> listOfMaps(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream().map(this::asMap).toList();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> copy = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (entry == null) {
                    continue;
                }
                Object rawKey = entry.getKey();
                if (rawKey == null) {
                    continue;
                }
                copy.put(String.valueOf(rawKey), entry.getValue());
            }
            return copy;
        }
        return new LinkedHashMap<>();
    }

    private int intValue(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text) {
            try {
                return Integer.parseInt(text.trim());
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    private Map<String, Object> productAsMap(OfferCatalogProductDTO product) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("productId", product.getProductId());
        payload.put("name", product.getName());
        payload.put("brand", product.getBrand());
        payload.put("category", product.getCategory());
        payload.put("unit", product.getUnit());
        payload.put("packageDescription", product.getPackageDescription());
        payload.put("currentPrice", product.getCurrentPrice());
        payload.put("baselinePrice", product.getBaselinePrice());
        payload.put("imageUrl", product.getImageUrl());
        payload.put("productUrl", product.getProductUrl());
        payload.put("lastSoldAt", product.getLastSoldAt());
        return payload;
    }

    private List<String> nonEmptyList(List<String> values, List<String> fallback) {
        if (values == null || values.isEmpty()) {
            return fallback;
        }
        List<String> normalized = values.stream()
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .toList();
        return normalized.isEmpty() ? fallback : normalized;
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Falha ao serializar configuracao do estudio de ofertas", exception);
        }
    }

    private Map<String, Object> parseJsonObject(String value) {
        try {
            if (value == null || value.isBlank()) {
                return new LinkedHashMap<>();
            }
            return objectMapper.readValue(value, MAP_TYPE);
        } catch (JsonProcessingException exception) {
            return new LinkedHashMap<>();
        }
    }

    private Map<String, Object> starterBrandTokens() {
        return new LinkedHashMap<>(Map.of(
            "colors", Map.of("primary", "#ff6a00", "secondary", "#2c1d17", "surface", "#fff7ef", "surfaceAlt", "#ffffff", "text", "#1f1613"),
            "fonts", Map.of("headline", "Outfit", "body", "Manrope", "mono", "IBM Plex Mono"),
            "logoLabel", "MercadoFlow",
            "qrValue", "https://mercadoflow.com"
        ));
    }

    private Map<String, Object> starterBrandAssets() {
        return new LinkedHashMap<>(Map.of(
            "logo", Map.of("type", "text-lockup", "label", "MercadoFlow"),
            "footer", Map.of("disclaimer", "Ofertas validas enquanto durarem os estoques"),
            "socialLinks", List.of("Instagram", "WhatsApp", "Portal")
        ));
    }

    private Map<String, Object> starterCampaignTokens(String headline) {
        return new LinkedHashMap<>(Map.of(
            "headline", headline,
            "subheadline", "Produtos e precos preenchidos automaticamente pelo catalogo global.",
            "footer", "Imagens meramente ilustrativas. Consulte validade e disponibilidade na loja.",
            "badgeLabel", "Encarte rapido"
        ));
    }

    private Map<String, Object> starterCampaignAssets(String campaignKey) {
        return new LinkedHashMap<>(Map.of(
            "badge3d", Map.of("type", "glow-pill", "key", campaignKey),
            "backgroundArt", Map.of("type", "soft-gradient", "key", campaignKey),
            "legal", List.of("Ofertas sujeitas a alteracao sem aviso previo")
        ));
    }

    private OfferTemplateVariant resolveVariant(OfferTemplate template, String variantKey) {
        String effectiveVariantKey = normalizeText(variantKey, normalizeText(template.getDefaultVariantKey(), null));
        if (effectiveVariantKey != null) {
            var fromKey = offerTemplateVariantRepository.findByTemplate_IdAndVariantKey(template.getId(), effectiveVariantKey);
            if (fromKey.isPresent()) {
                return fromKey.get();
            }
        }
        List<OfferTemplateVariant> variants = offerTemplateVariantRepository.findByTemplate_IdOrderByCreatedAtAsc(template.getId());
        return variants.isEmpty() ? null : variants.get(0);
    }

    private Map<String, Object> boundsFromLegacySlot(Map<String, Object> slot, int width, int height) {
        Map<String, Object> bounds = new LinkedHashMap<>();
        bounds.put("x", intValue(slot.get("x"), 0));
        bounds.put("y", intValue(slot.get("y"), 0));
        bounds.put("w", intValue(slot.get("w"), width));
        bounds.put("h", intValue(slot.get("h"), height));
        return bounds;
    }

    private Map<String, Object> legacyLayerProps(Map<String, Object> slot) {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("background", slot.get("background"));
        props.put("radius", slot.get("radius"));
        props.put("fontSize", slot.get("fontSize"));
        props.put("fontWeight", slot.get("fontWeight"));
        props.put("fit", slot.get("fit"));
        return props;
    }

    private String buildOutputUrl(OfferGenerationJob job, OfferRenderOutput output) {
        return "/generated/offers/" + job.getId() + "/" + slugify(output.getVariantKey() + "-" + output.getOutputType() + "-" + output.getPublishTarget()) + "." + output.getOutputType().toLowerCase(Locale.ROOT);
    }

    private String slugify(String value) {
        return normalizeText(value, "item")
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("(^-|-$)", "");
    }

    private String normalizeText(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? fallback : normalized;
    }

    private String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private UUID uuidFromText(String value) {
        if (value == null || value.isBlank() || "null".equalsIgnoreCase(value.trim())) {
            return null;
        }
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private BigDecimal numberToBigDecimal(Object value) {
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        if (value instanceof String text) {
            try {
                return new BigDecimal(text.trim().replace(",", "."));
            } catch (NumberFormatException ignored) {
            }
        }
        return BigDecimal.ZERO;
    }

    private BigDecimal defaultMoney(BigDecimal value) {
        return value != null ? value.setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    }

    private UUID uuid(ResultSet rs, String column) throws SQLException {
        Object value = rs.getObject(column);
        if (value == null) {
            return null;
        }
        return value instanceof UUID uuid ? uuid : UUID.fromString(value.toString());
    }

    private LocalDateTime localDateTime(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp != null ? timestamp.toLocalDateTime() : null;
    }
}







