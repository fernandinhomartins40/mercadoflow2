package com.pdv2cloud.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.MarketCockpitDTO;
import com.pdv2cloud.model.dto.OfferCatalogProductDTO;
import com.pdv2cloud.model.dto.OfferGenerationJobCreateRequest;
import com.pdv2cloud.model.dto.OfferGenerationJobDTO;
import com.pdv2cloud.model.dto.OfferGenerationJobItemDTO;
import com.pdv2cloud.model.dto.OfferOverviewDTO;
import com.pdv2cloud.model.dto.OfferTemplateDTO;
import com.pdv2cloud.model.dto.OfferTemplateUpsertRequest;
import com.pdv2cloud.model.dto.ProductPerformanceDTO;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.OfferGenerationJob;
import com.pdv2cloud.model.entity.OfferGenerationJobItem;
import com.pdv2cloud.model.entity.OfferTemplate;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.OfferGenerationJobItemRepository;
import com.pdv2cloud.repository.OfferGenerationJobRepository;
import com.pdv2cloud.repository.OfferTemplateRepository;
import com.pdv2cloud.repository.ProductRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OfferDesignerService {

    private final OfferTemplateRepository offerTemplateRepository;
    private final OfferGenerationJobRepository offerGenerationJobRepository;
    private final OfferGenerationJobItemRepository offerGenerationJobItemRepository;
    private final MarketRepository marketRepository;
    private final ProductRepository productRepository;
    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final CatalogImageStorageService catalogImageStorageService;
    private final AdvancedAnalyticsService advancedAnalyticsService;
    private final ObjectMapper objectMapper;

    public OfferDesignerService(
        OfferTemplateRepository offerTemplateRepository,
        OfferGenerationJobRepository offerGenerationJobRepository,
        OfferGenerationJobItemRepository offerGenerationJobItemRepository,
        MarketRepository marketRepository,
        ProductRepository productRepository,
        NamedParameterJdbcTemplate jdbcTemplate,
        CatalogImageStorageService catalogImageStorageService,
        AdvancedAnalyticsService advancedAnalyticsService,
        ObjectMapper objectMapper
    ) {
        this.offerTemplateRepository = offerTemplateRepository;
        this.offerGenerationJobRepository = offerGenerationJobRepository;
        this.offerGenerationJobItemRepository = offerGenerationJobItemRepository;
        this.marketRepository = marketRepository;
        this.productRepository = productRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.catalogImageStorageService = catalogImageStorageService;
        this.advancedAnalyticsService = advancedAnalyticsService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public OfferOverviewDTO getOverview(UUID marketId) {
        ensureStarterTemplates(marketId);
        MarketCockpitDTO cockpit = advancedAnalyticsService.getCockpit(marketId, null, null);
        List<OfferTemplateDTO> templates = listTemplates(marketId);
        List<OfferGenerationJobDTO> recentJobs = listJobs(marketId);

        List<ProductPerformanceDTO> seasonalSuggestions = List.of();
        if (cockpit.getSeasonalCollections() != null && !cockpit.getSeasonalCollections().isEmpty()) {
            seasonalSuggestions = cockpit.getSeasonalCollections().get(0).getProducts().stream()
                .limit(8)
                .toList();
        }

        return new OfferOverviewDTO(
            templates.size(),
            offerGenerationJobRepository.countByMarket_Id(marketId),
            offerGenerationJobRepository.countByMarket_IdAndStatus(marketId, "QUEUED"),
            templates,
            recentJobs,
            cockpit.getReplenishmentCandidates() != null ? cockpit.getReplenishmentCandidates().stream().limit(8).toList() : List.of(),
            seasonalSuggestions,
            cockpit.getPromotionHighlights() != null ? cockpit.getPromotionHighlights().stream().limit(8).toList() : List.of(),
            cockpit.getTopPairs() != null ? cockpit.getTopPairs().stream().limit(8).toList() : List.of()
        );
    }

    @Transactional
    public List<OfferTemplateDTO> listTemplates(UUID marketId) {
        ensureStarterTemplates(marketId);
        return offerTemplateRepository.findByMarket_IdOrderByIsSystemTemplateDescUpdatedAtDesc(marketId).stream()
            .map(this::toTemplateDto)
            .toList();
    }

    @Transactional
    public OfferTemplateDTO getTemplate(UUID marketId, UUID templateId) {
        ensureStarterTemplates(marketId);
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
        return toTemplateDto(offerTemplateRepository.save(template));
    }

    @Transactional
    public OfferTemplateDTO updateTemplate(UUID marketId, UUID templateId, OfferTemplateUpsertRequest request) {
        OfferTemplate template = offerTemplateRepository.findByIdAndMarket_Id(templateId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Template não encontrado"));
        applyTemplateRequest(template, request, Boolean.TRUE.equals(template.getIsSystemTemplate()));
        return toTemplateDto(offerTemplateRepository.save(template));
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
        return offerGenerationJobRepository.findTop20ByMarket_IdOrderByCreatedAtDesc(marketId).stream()
            .map(this::toJobDto)
            .toList();
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
        job.setStatus("QUEUED");
        job.setOutputType(normalizeText(request.getOutputType(), "PNG"));
        job.setGenerationMode(normalizeText(request.getGenerationMode(), "INDIVIDUAL"));
        job.setProductCount(products.size());
        job.setPageCount("CATALOG".equalsIgnoreCase(job.getGenerationMode())
            ? (int) Math.ceil(products.size() / 6.0d)
            : products.size());
        job.setTemplateSnapshotJson(template.getDesignJson());
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
            item.setProductName(product.getName());
            item.setProductImageUrl(product.getImageUrl());
            item.setProductUnit(product.getUnit());
            item.setCurrentPrice(product.getCurrentPrice());
            item.setStatus("PENDING");
            item.setBindingJson(buildBindingJson(product));
            items.add(item);
        }
        offerGenerationJobItemRepository.saveAll(items);
        return toJobDto(savedJob);
    }

    private void ensureStarterTemplates(UUID marketId) {
        if (offerTemplateRepository.findByMarket_IdAndTemplateKey(marketId, "poster-premium").isEmpty()) {
            createStarterTemplate(marketId, "poster-premium", "Cartaz premium 1 produto", "Cartaz vertical para destaque de um único item.", "PRINT", 1080, 1350, buildPosterTemplateJson());
        }
        if (offerTemplateRepository.findByMarket_IdAndTemplateKey(marketId, "encarte-grid").isEmpty()) {
            createStarterTemplate(marketId, "encarte-grid", "Encarte grid 6 produtos", "Página de encarte para montagem rápida com seis ofertas.", "FLYER", 1600, 2000, buildFlyerTemplateJson());
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
        template.setName(name);
        template.setDescription(description);
        template.setChannel(channel);
        template.setCanvasWidth(canvasWidth);
        template.setCanvasHeight(canvasHeight);
        template.setDesignJson(designJson);
        template.setIsActive(true);
        template.setIsSystemTemplate(true);
        offerTemplateRepository.save(template);
    }

    private void applyTemplateRequest(OfferTemplate template, OfferTemplateUpsertRequest request, boolean keepSystemFlag) {
        String name = normalizeText(request.getName(), null);
        if (name == null) {
            throw new IllegalArgumentException("Nome do template é obrigatório");
        }
        Integer canvasWidth = request.getCanvasWidth() == null || request.getCanvasWidth() < 300 ? 1080 : request.getCanvasWidth();
        Integer canvasHeight = request.getCanvasHeight() == null || request.getCanvasHeight() < 300 ? 1350 : request.getCanvasHeight();
        String designJson = normalizeText(request.getDesignJson(), buildPosterTemplateJson());

        template.setName(name);
        template.setDescription(normalizeText(request.getDescription(), null));
        template.setChannel(normalizeText(request.getChannel(), "PRINT"));
        template.setCanvasWidth(canvasWidth);
        template.setCanvasHeight(canvasHeight);
        template.setDesignJson(designJson);
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
        return new OfferTemplateDTO(
            template.getId(),
            template.getTemplateKey(),
            template.getName(),
            template.getDescription(),
            template.getChannel(),
            template.getCanvasWidth(),
            template.getCanvasHeight(),
            template.getDesignJson(),
            template.getPreviewImageUrl(),
            template.getIsActive(),
            template.getIsSystemTemplate(),
            template.getCreatedAt(),
            template.getUpdatedAt()
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
                item.getBindingJson()
            ))
            .toList();

        return new OfferGenerationJobDTO(
            job.getId(),
            job.getTemplate() != null ? job.getTemplate().getId() : null,
            job.getTemplateName(),
            job.getName(),
            job.getStatus(),
            job.getOutputType(),
            job.getGenerationMode(),
            job.getProductCount(),
            job.getPageCount(),
            job.getTemplateSnapshotJson(),
            job.getCreatedAt(),
            job.getUpdatedAt(),
            items
        );
    }

    private Market findMarket(UUID marketId) {
        return marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
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
            throw new IllegalStateException("Não foi possível montar o binding do item", exception);
        }
    }

    private String buildPosterTemplateJson() {
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

    private String buildFlyerTemplateJson() {
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

