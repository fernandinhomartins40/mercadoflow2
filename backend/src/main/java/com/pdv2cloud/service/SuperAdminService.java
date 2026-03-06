package com.pdv2cloud.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.CatalogAdminProductDTO;
import com.pdv2cloud.model.dto.SuperAdminCatalogProductUpsertRequest;
import com.pdv2cloud.model.dto.SuperAdminCrawlerConfigDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerJobDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerMonitorDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunClaimRequestDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunFinishRequestDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerRunStartRequestDTO;
import com.pdv2cloud.model.dto.SuperAdminCrawlerSourceDTO;
import com.pdv2cloud.model.dto.SuperAdminMarketCreateRequest;
import com.pdv2cloud.model.dto.SuperAdminMarketDTO;
import com.pdv2cloud.model.dto.SuperAdminMarketUpdateRequest;
import com.pdv2cloud.model.dto.SuperAdminOverviewDTO;
import com.pdv2cloud.model.dto.SuperAdminUserCreateRequest;
import com.pdv2cloud.model.dto.SuperAdminUserDTO;
import com.pdv2cloud.model.dto.SuperAdminUserRoleUpdateRequest;
import com.pdv2cloud.model.dto.SuperAdminUserStatusRequest;
import com.pdv2cloud.model.entity.CatalogCrawlerConfig;
import com.pdv2cloud.model.entity.CatalogCrawlerRun;
import com.pdv2cloud.model.entity.CatalogCrawlerSource;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.CatalogCrawlerConfigRepository;
import com.pdv2cloud.repository.CatalogCrawlerRunRepository;
import com.pdv2cloud.repository.CatalogCrawlerSourceRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductEnrichmentRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class SuperAdminService {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};
    private static final String DEFAULT_USER_AGENT = "MercadoFlowCatalogBot/1.0 (+https://mercadoflow.com/catalog-bot)";
    private static final List<FixedCrawlerJob> FIXED_CRAWLER_JOBS = List.of(
        new FixedCrawlerJob(
            "Pao de Acucar",
            "PAODEACUCAR_WEB_BR",
            "Todas as categorias",
            "GPA public API + bestPrices",
            "extract_and_import_paodeacucar.py",
            "Importa todas as categorias usando a API publica do GPA, com detalhe por produto para recuperar GTIN, preco e imagem.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of("https://api.vendas.gpa.digital/pa/v4/products/categories/ecom"),
            List.of("api.vendas.gpa.digital", "www.paodeacucar.com", "paodeacucar.com")
        ),
        new FixedCrawlerJob(
            "Extra Mercado",
            "EXTRA_WEB_BR",
            "Todas as categorias",
            "GPA public API + bestPrices",
            "extract_and_import_extra.py",
            "Importa todas as categorias usando a API publica do GPA para a bandeira Extra, com detalhe por produto para recuperar GTIN, preco e imagem.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of("https://api.vendas.gpa.digital/ex/v4/products/categories/ecom"),
            List.of("api.vendas.gpa.digital", "www.extramercado.com.br", "extramercado.com.br")
        ),
        new FixedCrawlerJob(
            "Carrefour Brasil",
            "CARREFOUR_WEB_BR",
            "Todas as categorias",
            "VTEX sitemap + product API",
            "extract_and_import_carrefour.py",
            "Enumera todos os produtos via sitemap oficial e busca o detalhe estruturado da VTEX por slug para maximizar recuperacao de GTIN e imagem.",
            "Public website/API data (respect provider terms and robots)",
            false,
            true,
            List.of("https://www.carrefour.com.br/sitemap.xml"),
            List.of("www.carrefour.com.br", "carrefour.com.br", "carrefourbr.vtexcommercestable.com.br", "carrefourbr.myvtex.com")
        ),
        new FixedCrawlerJob(
            "Drogaria Sao Paulo",
            "DROGARIASP_WEB_BR",
            "Todas as categorias",
            "VTEX catalog API",
            "extract_and_import_drogariasp.py",
            "Importa todas as categorias pela API publica da VTEX e inclui medicamentos quando o provider expuser GTIN.",
            "Public website/API data (respect provider terms and robots)",
            true,
            true,
            List.of("https://www.drogariasaopaulo.com.br/api/catalog_system/pub/products/search?_from=0&_to=49"),
            List.of("www.drogariasaopaulo.com.br", "drogariasaopaulo.com.br")
        )
    );

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductEnrichmentRepository productEnrichmentRepository;

    @Autowired
    private ProductCatalogService productCatalogService;

    @Autowired
    private CatalogCrawlerConfigRepository crawlerConfigRepository;

    @Autowired
    private CatalogCrawlerSourceRepository crawlerSourceRepository;

    @Autowired
    private CatalogCrawlerRunRepository crawlerRunRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public SuperAdminOverviewDTO getOverview() {
        long totalUsers = userRepository.count();
        long activeUsers = userRepository.countByIsActive(true);
        long blockedUsers = totalUsers - activeUsers;
        long totalMarkets = marketRepository.count();
        long activeMarkets = marketRepository.countByIsActive(true);
        long totalCatalogProducts = productRepository.count();
        long totalCatalogEnrichments = productEnrichmentRepository.count();
        return new SuperAdminOverviewDTO(
            totalUsers,
            activeUsers,
            blockedUsers,
            totalMarkets,
            activeMarkets,
            totalCatalogProducts,
            totalCatalogEnrichments
        );
    }

    @Transactional(readOnly = true)
    public Page<SuperAdminUserDTO> listUsers(String search, Pageable pageable) {
        String pattern = normalizeSearch(search);
        return userRepository.searchForSuperAdmin(pattern, pageable).map(this::toUserDTO);
    }

    public SuperAdminUserDTO createUser(SuperAdminUserCreateRequest request) {
        if (userRepository.findByEmail(request.getEmail().trim().toLowerCase(Locale.ROOT)).isPresent()) {
            throw new IllegalArgumentException("Email ja cadastrado");
        }

        User user = new User();
        user.setName(request.getName().trim());
        user.setEmail(request.getEmail().trim().toLowerCase(Locale.ROOT));
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRole(request.getRole());
        user.setIsActive(Boolean.TRUE.equals(request.getIsActive()));

        if (request.getMarketId() != null) {
            Market market = marketRepository.findById(request.getMarketId())
                .orElseThrow(() -> new IllegalArgumentException("Mercado nao encontrado"));
            user.setMarket(market);
        } else {
            user.setMarket(null);
        }

        return toUserDTO(userRepository.save(user));
    }

    public SuperAdminUserDTO updateUserStatus(UUID userId, SuperAdminUserStatusRequest request) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado"));
        user.setIsActive(Boolean.TRUE.equals(request.getActive()));
        return toUserDTO(userRepository.save(user));
    }

    public SuperAdminUserDTO updateUserRole(UUID userId, SuperAdminUserRoleUpdateRequest request) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado"));
        user.setRole(request.getRole());
        return toUserDTO(userRepository.save(user));
    }

    @Transactional(readOnly = true)
    public Page<SuperAdminMarketDTO> listMarkets(String search, Pageable pageable) {
        String pattern = normalizeSearch(search);
        return marketRepository.searchForSuperAdmin(pattern, pageable).map(this::toMarketDTO);
    }

    public SuperAdminMarketDTO createMarket(SuperAdminMarketCreateRequest request) {
        Market market = new Market();
        market.setName(request.getName().trim());
        market.setCnpj(request.getCnpj());
        market.setPlanType(request.getPlanType());
        market.setIsActive(Boolean.TRUE.equals(request.getActive()));
        return toMarketDTO(marketRepository.save(market));
    }

    public SuperAdminMarketDTO updateMarket(UUID marketId, SuperAdminMarketUpdateRequest request) {
        Market market = marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado nao encontrado"));
        if (request.getName() != null && !request.getName().isBlank()) {
            market.setName(request.getName().trim());
        }
        if (request.getPlanType() != null) {
            market.setPlanType(request.getPlanType());
        }
        if (request.getActive() != null) {
            market.setIsActive(request.getActive());
        }
        return toMarketDTO(marketRepository.save(market));
    }

    public CatalogAdminProductDTO upsertCatalogProduct(SuperAdminCatalogProductUpsertRequest request) {
        return productCatalogService.upsertManualCatalogProduct(request);
    }

    public CatalogAdminProductDTO updateCatalogProduct(UUID productId, SuperAdminCatalogProductUpsertRequest request) {
        return productCatalogService.updateManualCatalogProduct(productId, request);
    }

    public SuperAdminCrawlerConfigDTO getCrawlerConfig(boolean onlyEnabledSources) {
        CatalogCrawlerConfig config = ensureCrawlerConfig();

        SuperAdminCrawlerConfigDTO dto = new SuperAdminCrawlerConfigDTO();
        dto.setUserAgent(config.getUserAgent());
        dto.setIntervalMinutes(config.getIntervalMinutes());
        dto.setEnabled(config.getIsEnabled());

        List<SuperAdminCrawlerSourceDTO> sourceDTOs = new ArrayList<>();
        for (FixedCrawlerJob job : FIXED_CRAWLER_JOBS) {
            sourceDTOs.add(toCrawlerSourceDTO(job));
        }
        dto.setSources(sourceDTOs);
        return dto;
    }

    public SuperAdminCrawlerConfigDTO saveCrawlerConfig(SuperAdminCrawlerConfigDTO request) {
        CatalogCrawlerConfig config = ensureCrawlerConfig();
        config.setUserAgent(
            request.getUserAgent() != null && !request.getUserAgent().isBlank()
                ? request.getUserAgent().trim()
                : DEFAULT_USER_AGENT
        );
        config.setIntervalMinutes(request.getIntervalMinutes() != null ? Math.max(request.getIntervalMinutes(), 5) : 360);
        config.setIsEnabled(request.getEnabled() == null || request.getEnabled());
        config.setUpdatedAt(LocalDateTime.now());
        crawlerConfigRepository.save(config);
        return getCrawlerConfig(false);
    }

    @Transactional(readOnly = true)
    public SuperAdminCrawlerMonitorDTO getCrawlerMonitor(int size) {
        int safeSize = Math.max(1, Math.min(size, 30));
        Page<CatalogCrawlerRun> runsPage = crawlerRunRepository.findAllByOrderByRequestedAtDesc(
            PageRequest.of(0, safeSize)
        );

        SuperAdminCrawlerMonitorDTO monitor = new SuperAdminCrawlerMonitorDTO();
        monitor.setQueuedRuns(crawlerRunRepository.countByStatus("QUEUED"));
        monitor.setRunningRuns(crawlerRunRepository.countByStatus("RUNNING"));
        monitor.setRecentRuns(runsPage.getContent().stream().map(this::toCrawlerRunDTO).toList());
        crawlerRunRepository.findTopByOrderByRequestedAtDesc().ifPresent(run -> monitor.setLatestRun(toCrawlerRunDTO(run)));
        return monitor;
    }

    @Transactional(readOnly = true)
    public List<SuperAdminCrawlerJobDTO> listCrawlerJobs() {
        return FIXED_CRAWLER_JOBS.stream().map(this::toCrawlerJobDTO).toList();
    }

    public SuperAdminCrawlerRunDTO triggerCrawlerRun(String triggeredBy) {
        CatalogCrawlerRun run = new CatalogCrawlerRun();
        run.setRequestedAt(LocalDateTime.now());
        run.setStatus("QUEUED");
        run.setMessage("Execucao enfileirada aguardando servico Python.");
        run.setTriggeredBy(cleanLabel(triggeredBy, "MANUAL_SUPER_ADMIN"));
        run.setSourcesJson(exportFixedProvidersAsJson());
        return toCrawlerRunDTO(crawlerRunRepository.save(run));
    }

    public SuperAdminCrawlerRunDTO triggerCrawlerRunForProvider(String provider, String triggeredBy) {
        FixedCrawlerJob job = findFixedCrawlerJob(provider);
        CatalogCrawlerRun run = new CatalogCrawlerRun();
        run.setRequestedAt(LocalDateTime.now());
        run.setStatus("QUEUED");
        run.setMessage("Execucao enfileirada aguardando servico Python.");
        run.setTriggeredBy(cleanLabel(triggeredBy, "MANUAL_SUPER_ADMIN"));
        run.setSourcesJson(toJsonArray(List.of(job.provider())));
        return toCrawlerRunDTO(crawlerRunRepository.save(run));
    }

    public SuperAdminCrawlerRunDTO claimPendingCrawlerRun(SuperAdminCrawlerRunClaimRequestDTO request) {
        String workerName = request != null ? request.getWorkerName() : null;
        return crawlerRunRepository.findFirstByStatusOrderByRequestedAtAsc("QUEUED")
            .map(run -> {
                run.setStatus("RUNNING");
                run.setStartedAt(LocalDateTime.now());
                run.setMessage("Execucao iniciada pelo crawler.");
                if (run.getTriggeredBy() == null || run.getTriggeredBy().isBlank()) {
                    run.setTriggeredBy(cleanLabel(workerName, "PYTHON_CRAWLER"));
                }
                return toCrawlerRunDTO(crawlerRunRepository.save(run));
            })
            .orElse(null);
    }

    public SuperAdminCrawlerRunDTO startCrawlerRun(SuperAdminCrawlerRunStartRequestDTO request) {
        CatalogCrawlerRun run = new CatalogCrawlerRun();
        run.setRequestedAt(LocalDateTime.now());
        run.setStartedAt(LocalDateTime.now());
        run.setStatus("RUNNING");
        run.setTriggeredBy(cleanLabel(request != null ? request.getTriggeredBy() : null, "SCHEDULED_CRAWLER"));
        run.setMessage(cleanMessage(request != null ? request.getMessage() : null));
        run.setSourcesJson(toJsonArray(request != null ? request.getSources() : Collections.emptyList()));
        return toCrawlerRunDTO(crawlerRunRepository.save(run));
    }

    public SuperAdminCrawlerRunDTO finishCrawlerRun(UUID runId, SuperAdminCrawlerRunFinishRequestDTO request) {
        CatalogCrawlerRun run = crawlerRunRepository.findById(runId)
            .orElseThrow(() -> new IllegalArgumentException("Execucao do crawler nao encontrada"));

        run.setStatus(normalizeRunStatus(request != null ? request.getStatus() : null));
        if (run.getStartedAt() == null) {
            run.setStartedAt(LocalDateTime.now());
        }
        run.setFinishedAt(LocalDateTime.now());
        run.setScannedProducts(safeInt(request != null ? request.getScannedProducts() : null));
        run.setImportedProducts(safeInt(request != null ? request.getImportedProducts() : null));
        run.setSkippedInvalidGtin(safeInt(request != null ? request.getSkippedInvalidGtin() : null));
        run.setSkippedMissingName(safeInt(request != null ? request.getSkippedMissingName() : null));
        run.setSkippedMedication(safeInt(request != null ? request.getSkippedMedication() : null));
        run.setSkippedDuplicateGtin(safeInt(request != null ? request.getSkippedDuplicateGtin() : null));
        run.setErrors(safeInt(request != null ? request.getErrors() : null));
        run.setMessage(cleanMessage(request != null ? request.getMessage() : null));
        List<String> sources = request != null ? request.getSources() : Collections.emptyList();
        if (sources != null && !sources.isEmpty()) {
            run.setSourcesJson(toJsonArray(sources));
        }
        return toCrawlerRunDTO(crawlerRunRepository.save(run));
    }

    private SuperAdminUserDTO toUserDTO(User user) {
        Market market = user.getMarket();
        return new SuperAdminUserDTO(
            user.getId(),
            user.getName(),
            user.getEmail(),
            user.getRole(),
            user.getIsActive(),
            user.getCreatedAt(),
            market != null ? market.getId() : null,
            market != null ? market.getName() : null,
            market != null ? market.getPlanType() : null,
            market != null ? market.getIsActive() : null
        );
    }

    private SuperAdminMarketDTO toMarketDTO(Market market) {
        long usersCount = userRepository.countByMarket_Id(market.getId());
        return new SuperAdminMarketDTO(
            market.getId(),
            market.getName(),
            market.getCnpj(),
            market.getPlanType(),
            market.getIsActive(),
            market.getCreatedAt(),
            usersCount
        );
    }

    private SuperAdminCrawlerSourceDTO toCrawlerSourceDTO(CatalogCrawlerSource source) {
        SuperAdminCrawlerSourceDTO dto = new SuperAdminCrawlerSourceDTO();
        dto.setId(source.getId());
        dto.setName(source.getName());
        dto.setProvider(source.getProvider());
        dto.setSourceLicense(source.getSourceLicense());
        dto.setSeeds(parseJsonArray(source.getSeedsJson()));
        dto.setAllowedDomains(parseJsonArray(source.getAllowedDomainsJson()));
        dto.setProductPathHints(parseJsonArray(source.getProductPathHintsJson()));
        dto.setMaxPages(source.getMaxPages());
        dto.setMaxRecords(source.getMaxRecords());
        dto.setRateLimitMs(source.getRateLimitMs());
        dto.setRequestTimeoutSec(source.getRequestTimeoutSec());
        dto.setEnabled(source.getIsEnabled());
        return dto;
    }

    private SuperAdminCrawlerSourceDTO toCrawlerSourceDTO(FixedCrawlerJob job) {
        SuperAdminCrawlerSourceDTO dto = new SuperAdminCrawlerSourceDTO();
        dto.setName(job.name());
        dto.setProvider(job.provider());
        dto.setSourceLicense(job.sourceLicense());
        dto.setSeeds(job.seeds());
        dto.setAllowedDomains(job.allowedDomains());
        dto.setProductPathHints(List.of("/produto", "/p/", "/api/catalog_system/pub/products/search"));
        dto.setMaxPages(5000);
        dto.setMaxRecords(2_000_000);
        dto.setRateLimitMs(250);
        dto.setRequestTimeoutSec(40);
        dto.setEnabled(true);
        return dto;
    }

    private SuperAdminCrawlerRunDTO toCrawlerRunDTO(CatalogCrawlerRun run) {
        SuperAdminCrawlerRunDTO dto = new SuperAdminCrawlerRunDTO();
        dto.setId(run.getId());
        dto.setStatus(run.getStatus());
        dto.setRequestedAt(run.getRequestedAt());
        dto.setStartedAt(run.getStartedAt());
        dto.setFinishedAt(run.getFinishedAt());
        dto.setScannedProducts(run.getScannedProducts());
        dto.setImportedProducts(run.getImportedProducts());
        dto.setSkippedInvalidGtin(run.getSkippedInvalidGtin());
        dto.setSkippedMissingName(run.getSkippedMissingName());
        dto.setSkippedMedication(run.getSkippedMedication());
        dto.setSkippedDuplicateGtin(run.getSkippedDuplicateGtin());
        dto.setErrors(run.getErrors());
        dto.setMessage(run.getMessage());
        dto.setTriggeredBy(run.getTriggeredBy());
        dto.setSources(parseJsonArray(run.getSourcesJson()));
        return dto;
    }

    private SuperAdminCrawlerJobDTO toCrawlerJobDTO(FixedCrawlerJob job) {
        String quotedProvider = "\"" + job.provider() + "\"";
        SuperAdminCrawlerJobDTO dto = new SuperAdminCrawlerJobDTO();
        dto.setProvider(job.provider());
        dto.setName(job.name());
        dto.setScopeLabel(job.scopeLabel());
        dto.setExtractorType(job.extractorType());
        dto.setScriptName(job.scriptName());
        dto.setDescription(job.description());
        dto.setSourceLicense(job.sourceLicense());
        dto.setIncludesMedication(job.includesMedication());
        dto.setDownloadsImages(job.downloadsImages());
        dto.setQueuedRuns((int) crawlerRunRepository.countByStatusAndSourcesJsonContaining("QUEUED", quotedProvider));
        dto.setRunningRuns((int) crawlerRunRepository.countByStatusAndSourcesJsonContaining("RUNNING", quotedProvider));
        crawlerRunRepository.findTopBySourcesJsonContainingOrderByRequestedAtDesc(quotedProvider)
            .ifPresent(run -> dto.setLastRun(toCrawlerRunDTO(run)));
        return dto;
    }

    private CatalogCrawlerConfig ensureCrawlerConfig() {
        return crawlerConfigRepository.findAll().stream().findFirst().orElseGet(() -> {
            CatalogCrawlerConfig cfg = new CatalogCrawlerConfig();
            cfg.setUserAgent(DEFAULT_USER_AGENT);
            cfg.setIntervalMinutes(360);
            cfg.setIsEnabled(true);
            cfg.setUpdatedAt(LocalDateTime.now());
            return crawlerConfigRepository.save(cfg);
        });
    }

    private void ensureDefaultCrawlerSources() {
        if (crawlerSourceRepository.count() > 0) {
            return;
        }
        crawlerSourceRepository.saveAll(List.of(
            buildDefaultSource(
                "Carrefour Brasil",
                "CARREFOUR_WEB_BR",
                List.of("https://www.carrefour.com.br/sitemap.xml"),
                List.of("www.carrefour.com.br", "carrefour.com.br")
            ),
            buildDefaultSource(
                "Pao de Acucar",
                "PAODEACUCAR_WEB_BR",
                List.of("https://www.paodeacucar.com/sitemap.xml"),
                List.of("www.paodeacucar.com", "paodeacucar.com")
            ),
            buildDefaultSource(
                "Extra",
                "EXTRA_WEB_BR",
                List.of("https://www.clubeextra.com.br/sitemap.xml"),
                List.of("www.clubeextra.com.br", "clubeextra.com.br")
            ),
            buildDefaultSource(
                "Drogaria Sao Paulo",
                "DROGARIASP_WEB_BR",
                List.of("https://www.drogariasaopaulo.com.br/sitemap.xml"),
                List.of("www.drogariasaopaulo.com.br", "drogariasaopaulo.com.br")
            )
        ));
    }

    private CatalogCrawlerSource buildDefaultSource(
        String name,
        String provider,
        List<String> seeds,
        List<String> allowedDomains
    ) {
        CatalogCrawlerSource source = new CatalogCrawlerSource();
        source.setName(name);
        source.setProvider(provider);
        source.setSourceLicense("Public website data (respect provider terms and robots)");
        source.setSeedsJson(toJsonArray(seeds));
        source.setAllowedDomainsJson(toJsonArray(allowedDomains));
        source.setProductPathHintsJson(toJsonArray(List.of("/produto", "/product", "/p/", "/sitemap")));
        source.setMaxPages(250);
        source.setMaxRecords(2500);
        source.setRateLimitMs(1000);
        source.setRequestTimeoutSec(20);
        source.setIsEnabled(true);
        return source;
    }

    private String exportFixedProvidersAsJson() {
        return toJsonArray(FIXED_CRAWLER_JOBS.stream().map(FixedCrawlerJob::provider).toList());
    }

    private FixedCrawlerJob findFixedCrawlerJob(String provider) {
        String normalizedProvider = provider == null ? "" : provider.trim().toUpperCase(Locale.ROOT);
        return FIXED_CRAWLER_JOBS.stream()
            .filter(job -> job.provider().equals(normalizedProvider))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Provider fixo do crawler nao encontrado: " + normalizedProvider));
    }

    private String normalizeSearch(String search) {
        if (search == null || search.isBlank()) {
            return "";
        }
        return "%" + search.trim().toLowerCase(Locale.ROOT) + "%";
    }

    private String toJsonArray(List<String> values) {
        List<String> sanitized = values == null ? Collections.emptyList() : values.stream()
            .map(value -> value == null ? "" : value.trim())
            .filter(value -> !value.isBlank())
            .toList();
        try {
            return objectMapper.writeValueAsString(sanitized);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Falha ao converter lista de configuracao");
        }
    }

    private List<String> parseJsonArray(String value) {
        if (value == null || value.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(value, STRING_LIST);
        } catch (Exception ex) {
            return new ArrayList<>();
        }
    }

    private String cleanLabel(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String trimmed = value.trim();
        return trimmed.length() > 120 ? trimmed.substring(0, 120) : trimmed;
    }

    private String cleanMessage(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() > 2000 ? trimmed.substring(0, 2000) : trimmed;
    }

    private String normalizeRunStatus(String status) {
        if (status == null || status.isBlank()) {
            return "SUCCESS";
        }
        String normalized = status.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "SUCCESS", "FAILED", "RUNNING", "QUEUED", "CANCELLED" -> normalized;
            default -> "SUCCESS";
        };
    }

    private Integer safeInt(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }

    private record FixedCrawlerJob(
        String name,
        String provider,
        String scopeLabel,
        String extractorType,
        String scriptName,
        String description,
        String sourceLicense,
        boolean includesMedication,
        boolean downloadsImages,
        List<String> seeds,
        List<String> allowedDomains
    ) {
    }
}
